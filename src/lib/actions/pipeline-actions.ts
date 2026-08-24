"use server";

import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID } from "@/lib/constants";
import { runScan } from "@/lib/pipeline/orchestrator";
import type { RunScanResult } from "@/lib/pipeline/orchestrator";
import { applyChangeToDeal } from "@/lib/pipeline/suggestions";
import type { DetectedChangeType } from "@/lib/pipeline/types";

export type { RunScanResult } from "@/lib/pipeline/orchestrator";

const prisma = getPrismaClient();

// Scoped to DEMO_ORG_ID (spec §57-58) — AiExtraction has no organizationId
// column of its own (dealId is optional, so it can't anchor the check
// alone), but every extraction always has an emailId, and every Email
// belongs to an EmailAccount that does carry organizationId. Used for both
// accept and reject so an extraction from another organization can never
// be matched by id alone.
const extractionOrgFilter = { email: { thread: { emailAccount: { organizationId: DEMO_ORG_ID } } } } as const;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated.");
  return session.user.id;
}

function revalidateScanAffectedPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/intelligence");
  revalidatePath("/intelligence/review");
  revalidatePath("/intelligence/scan");
  revalidatePath("/deals");
  revalidatePath("/tasks");
  revalidatePath("/pipeline");
}

/**
 * Runs the full email intelligence pipeline against the organization's
 * unprocessed email backlog (spec §26). Executes synchronously within this
 * Server Action — no background worker assumed, per spec §44's guidance
 * for a Vercel deployment — so the returned counters are always the real,
 * final result of a completed pipeline run, never a placeholder.
 */
export async function triggerEmailScan(): Promise<RunScanResult> {
  const userId = await requireUserId();
  const result = await runScan(DEMO_ORG_ID, userId);
  revalidateScanAffectedPaths();
  return result;
}

interface StoredChangeFields {
  changeType: DetectedChangeType | "NO_CHANGE";
  previousValue?: string;
  newValue?: string;
}

/**
 * Accepts an AI-suggested change: applies it to the Deal using the exact
 * same mutation path the pipeline's own AUTO_APPLY branch uses
 * (src/lib/pipeline/suggestions.ts), then marks the AiExtraction ACCEPTED.
 */
export async function acceptExtraction(extractionId: string): Promise<void> {
  const userId = await requireUserId();

  const extraction = await prisma.aiExtraction.findFirstOrThrow({
    where: { id: extractionId, ...extractionOrgFilter },
  });
  if (extraction.appliedStatus !== "SUGGESTED_PENDING") {
    throw new Error(`Extraction ${extractionId} is not pending review.`);
  }
  if (!extraction.dealId) throw new Error("Extraction has no associated deal to apply changes to.");
  if (!extraction.processingJobId) {
    throw new Error(
      `Extraction ${extractionId} predates the email intelligence pipeline and has no applicable change recorded.`,
    );
  }

  const fields = extraction.extractedFields as unknown as StoredChangeFields;
  if (fields.changeType && fields.changeType !== "NO_CHANGE") {
    if (!fields.previousValue || !fields.newValue) {
      throw new Error(`Extraction ${extractionId} is missing the previous/new value needed to apply it.`);
    }
    const deal = await prisma.deal.findUniqueOrThrow({
      where: { id: extraction.dealId },
      include: { currentStage: true, workflow: { include: { stages: true } } },
    });

    if (fields.changeType === "STAGE_CHANGED") {
      const targetStage = deal.workflow.stages.find((s) => s.label === fields.newValue);
      if (!targetStage) throw new Error(`Could not resolve stage "${fields.newValue}" to apply.`);
      await applyChangeToDeal(
        prisma,
        extraction.dealId,
        {
          type: "STAGE_CHANGED",
          previousValue: fields.previousValue,
          newValue: fields.newValue,
          confidencePercent: extraction.confidencePercent,
          applyStageId: targetStage.id,
        },
        extraction.id,
        extraction.emailId,
        new Date(),
        "Accepted from the AI Review Center.",
      );
    } else if (fields.changeType === "DEAL_VALUE_CHANGED") {
      const parsedMinor = parseMoneyStringToMinorUnits(fields.newValue);
      await applyChangeToDeal(
        prisma,
        extraction.dealId,
        {
          type: "DEAL_VALUE_CHANGED",
          previousValue: fields.previousValue,
          newValue: fields.newValue,
          confidencePercent: extraction.confidencePercent,
          applyValueMinorUnits: parsedMinor,
        },
        extraction.id,
        extraction.emailId,
        new Date(),
        "Accepted from the AI Review Center.",
      );
    }
  }

  await prisma.$transaction([
    prisma.aiExtraction.update({ where: { id: extractionId }, data: { appliedStatus: "ACCEPTED" } }),
    prisma.intelligenceEvent.updateMany({
      where: { aiExtractionId: extractionId },
      data: { reviewStatus: "REVIEWED" },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: DEMO_ORG_ID,
        actorUserId: userId,
        action: "AI suggestion accepted",
        entityType: "AiExtraction",
        entityId: extractionId,
      },
    }),
  ]);

  revalidateScanAffectedPaths();
  if (extraction.dealId) revalidatePath(`/deals/${extraction.dealId}`);
}

export async function rejectExtraction(extractionId: string): Promise<void> {
  const userId = await requireUserId();

  const extraction = await prisma.aiExtraction.findFirstOrThrow({
    where: { id: extractionId, ...extractionOrgFilter },
  });
  if (extraction.appliedStatus !== "SUGGESTED_PENDING") {
    throw new Error(`Extraction ${extractionId} is not pending review.`);
  }

  await prisma.$transaction([
    prisma.aiExtraction.update({ where: { id: extractionId }, data: { appliedStatus: "REJECTED" } }),
    prisma.intelligenceEvent.updateMany({
      where: { aiExtractionId: extractionId },
      data: { reviewStatus: "DISMISSED" },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: DEMO_ORG_ID,
        actorUserId: userId,
        action: "AI suggestion rejected",
        entityType: "AiExtraction",
        entityId: extractionId,
      },
    }),
  ]);

  revalidateScanAffectedPaths();
}

function parseMoneyStringToMinorUnits(formatted: string): bigint {
  const match = formatted.match(/([\d.]+)\s*([BM])?/i);
  if (!match) return 0n;
  const amount = Number.parseFloat(match[1]);
  const multiplier = match[2]?.toUpperCase() === "B" ? 1_000_000_000 : match[2]?.toUpperCase() === "M" ? 1_000_000 : 1;
  return BigInt(Math.round(amount * multiplier * 100));
}
