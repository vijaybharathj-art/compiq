"use server";

import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID } from "@/lib/constants";
import { generateMorningBriefing, generateEveningBriefing } from "@/lib/intelligence/briefing";
import { setInactivityException, clearInactivityException } from "@/lib/intelligence/inactivity";

// Phase 4 Server Actions — risk resolution, inactivity exceptions, and
// manual briefing generation. Follows the same pattern as
// src/lib/actions/mutations.ts (requireUserId + AuditLog on every write).

const prisma = getPrismaClient();

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated.");
  return session.user.id;
}

async function writeAuditLog(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await prisma.auditLog.create({
    data: { organizationId: DEMO_ORG_ID, actorUserId, action, entityType, entityId, metadata },
  });
}

// ---------------------------------------------------------------------------
// Risk lifecycle (spec §13, §48-49)
// ---------------------------------------------------------------------------

type RiskStatusValue = "ACKNOWLEDGED" | "DISMISSED" | "RESOLVED" | "OPEN";

async function setRiskStatus(riskId: string, status: RiskStatusValue, resolutionNote?: string) {
  const userId = await requireUserId();
  const risk = await prisma.risk.update({ where: { id: riskId }, data: { status, resolutionNote } });

  const actionLabel =
    status === "ACKNOWLEDGED"
      ? "Risk acknowledged"
      : status === "DISMISSED"
        ? "Risk dismissed"
        : status === "RESOLVED"
          ? "Risk resolved"
          : "Risk reopened";
  await writeAuditLog(userId, actionLabel, "Risk", riskId, { riskType: risk.riskType, severity: risk.severity });

  revalidatePath("/intelligence");
  revalidatePath("/dashboard");
  if (risk.dealId) revalidatePath(`/deals/${risk.dealId}`);
}

export async function acknowledgeRisk(riskId: string) {
  await setRiskStatus(riskId, "ACKNOWLEDGED");
}

export async function dismissRisk(riskId: string, reason?: string) {
  await setRiskStatus(riskId, "DISMISSED", reason ?? "Not a concern / false positive.");
}

export async function resolveRisk(riskId: string, resolutionNote?: string) {
  await setRiskStatus(riskId, "RESOLVED", resolutionNote);
}

// ---------------------------------------------------------------------------
// Inactivity exceptions (spec §50)
// ---------------------------------------------------------------------------

export async function ignoreInactivity(dealId: string, reason: string, ignoredUntil?: string) {
  const userId = await requireUserId();
  await setInactivityException(prisma, dealId, {
    reason,
    ignoredUntil: ignoredUntil ? new Date(ignoredUntil) : null,
    createdById: userId,
  });
  await writeAuditLog(userId, "Inactivity ignored", "Deal", dealId, {
    reason,
    ignoredUntil: ignoredUntil ?? null,
  });
  revalidatePath("/intelligence");
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${dealId}`);
}

export async function clearInactivityIgnore(dealId: string) {
  const userId = await requireUserId();
  await clearInactivityException(prisma, dealId);
  await writeAuditLog(userId, "Inactivity exception cleared", "Deal", dealId);
  revalidatePath("/intelligence");
  revalidatePath(`/deals/${dealId}`);
}

// ---------------------------------------------------------------------------
// Briefing generation (spec §41, manual trigger — no scheduler in Phase 4)
// ---------------------------------------------------------------------------

export async function generateMorningBriefingAction(): Promise<void> {
  const userId = await requireUserId();
  const briefing = await generateMorningBriefing(DEMO_ORG_ID, userId);
  await writeAuditLog(userId, "Briefing generated", "Briefing", briefing.id, { type: "MORNING" });
  revalidatePath("/intelligence/morning");
  revalidatePath("/dashboard");
}

export async function generateEveningBriefingAction(): Promise<void> {
  const userId = await requireUserId();
  const briefing = await generateEveningBriefing(DEMO_ORG_ID, userId);
  await writeAuditLog(userId, "Briefing generated", "Briefing", briefing.id, { type: "EVENING" });
  revalidatePath("/intelligence/evening");
}
