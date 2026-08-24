import type { PrismaClient } from "@/generated/prisma/client";
import type { ExtractionResult } from "@/lib/ai/extraction-schema";
import type { DealMatchDecision } from "./matching";
import { decideConfidenceAction, getConfidencePolicy } from "@/lib/ai/confidence-policy";
import { detectChanges } from "./change-detection";
import { createIntelligenceEvent } from "./intelligence-events";
import { touchMeaningfulActivity } from "@/lib/intelligence/inactivity";
import { recordValuationObservation, computeValuationChange, formatPercentChange } from "@/lib/intelligence/valuation";
import { explainStageChange } from "@/lib/intelligence/stage";
import type { DetectedChange, ScanCounters } from "./types";

// AI suggestion / auto-update + evidence storage + deal timeline stages
// (spec §14-18, §24). One AiExtraction row is created per detected change
// (or one INFO_ONLY row when there's no concrete change) so the AI Review
// Center can accept/reject exactly one suggestion at a time — matching the
// worked examples in spec §17.

export interface ApplySuggestionsParams {
  organizationId: string;
  emailId: string;
  dealId: string;
  extraction: ExtractionResult;
  matchDecision: DealMatchDecision;
  processingJobId: string;
  occurredAt: Date;
}

async function writeExtraction(
  db: PrismaClient,
  params: ApplySuggestionsParams,
  fields: Record<string, unknown>,
  confidencePercent: number,
  appliedStatus: "AUTO_APPLIED" | "SUGGESTED_PENDING" | "INFO_ONLY",
) {
  const extraction = await db.aiExtraction.create({
    data: {
      emailId: params.emailId,
      dealId: params.dealId,
      extractedFields: fields as never,
      confidencePercent: Math.round(confidencePercent),
      matchType: params.matchDecision.matchType,
      appliedStatus,
      promptVersion: params.extraction.promptVersion,
      processingJobId: params.processingJobId,
    },
  });
  await db.aiExtractionEvidence.create({
    data: {
      extractionId: extraction.id,
      emailId: params.emailId,
      quotedExcerpt: params.extraction.evidence.quotedExcerpt,
      senderName: params.extraction.evidence.senderName,
      sentAt: new Date(params.extraction.evidence.sentAt),
    },
  });
  return extraction;
}

export async function applyDealChanges(
  db: PrismaClient,
  params: ApplySuggestionsParams,
  counters: ScanCounters,
): Promise<void> {
  const changes = await detectChanges(db, params.dealId, params.extraction);
  const policy = getConfidencePolicy();

  if (changes.length === 0) {
    await writeExtraction(
      db,
      params,
      { changeType: "NO_CHANGE", fullExtraction: params.extraction },
      params.extraction.confidencePercent,
      "INFO_ONLY",
    );
    // Substantive correspondence about a matched deal is itself meaningful
    // activity even without a detected field change (spec §16).
    await touchMeaningfulActivity(db, params.dealId, params.occurredAt);
    return;
  }

  for (const change of changes) {
    const decision = decideConfidenceAction(change.confidencePercent, policy);
    const appliedStatus =
      decision === "AUTO_APPLY" ? "AUTO_APPLIED" : decision === "SUGGESTED_PENDING" ? "SUGGESTED_PENDING" : "INFO_ONLY";

    const extractionRow = await writeExtraction(
      db,
      params,
      { changeType: change.type, previousValue: change.previousValue, newValue: change.newValue, fullExtraction: params.extraction },
      change.confidencePercent,
      appliedStatus,
    );

    if (decision === "AUTO_APPLY") {
      await applyChangeToDeal(db, params.dealId, change, extractionRow.id, params.emailId, params.occurredAt);
      counters.dealsUpdated += 1;
    } else if (decision === "SUGGESTED_PENDING") {
      counters.suggestionsForReview += 1;
    }

    let detail = `${change.previousValue} → ${change.newValue}`;
    if (change.type === "DEAL_VALUE_CHANGED" && change.applyValueMinorUnits !== undefined) {
      const { percentChange } = computeValuationChange(change.previousValueMinorUnits ?? null, change.applyValueMinorUnits);
      detail = `${change.previousValue} → ${change.newValue} (${formatPercentChange(percentChange)})`;
    }
    if (change.type === "STAGE_CHANGED" && change.applyStageId) {
      const [dealMeta, newStage] = await Promise.all([
        db.deal.findUnique({ where: { id: params.dealId }, select: { projectCodename: true } }),
        db.dealStageDefinition.findUnique({ where: { id: change.applyStageId }, select: { key: true, label: true } }),
      ]);
      if (dealMeta && newStage) {
        detail = explainStageChange(dealMeta.projectCodename, change.previousValue, newStage);
      }
    }

    await createIntelligenceEvent(db, {
      organizationId: params.organizationId,
      eventType: change.type,
      dealId: params.dealId,
      headline: changeHeadline(change.type, decision),
      detail,
      deltaFrom: change.previousValue,
      deltaTo: change.newValue,
      confidencePercent: change.confidencePercent,
      sourceEmailId: params.emailId,
      aiExtractionId: extractionRow.id,
      processingJobId: params.processingJobId,
      occurredAt: params.occurredAt,
    });
  }
}

function changeHeadline(type: string, decision: string): string {
  const label = type === "DEAL_VALUE_CHANGED" ? "Deal value updated" : type === "STAGE_CHANGED" ? "Deal stage changed" : "Mandate changed";
  return decision === "SUGGESTED_PENDING" ? `${label} (pending review)` : label;
}

/**
 * Mutates the Deal for one detected change and records the timeline entry.
 * Shared by the automatic AUTO_APPLY path above and the manual "Accept"
 * action in the AI Review Center (src/lib/actions/pipeline-actions.ts) so
 * both write identical DealEvent/Deal state — the only difference is the
 * note and who gets credited.
 */
export async function applyChangeToDeal(
  db: PrismaClient,
  dealId: string,
  change: Pick<DetectedChange, "type" | "previousValue" | "newValue" | "confidencePercent" | "applyValueMinorUnits" | "applyStageId">,
  aiExtractionId: string,
  sourceEmailId: string,
  occurredAt: Date,
  note: string = "Auto-applied by the email intelligence pipeline.",
): Promise<void> {
  if (change.type === "DEAL_VALUE_CHANGED" && change.applyValueMinorUnits !== undefined) {
    const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId }, select: { currency: true } });
    await db.deal.update({
      where: { id: dealId },
      data: { enterpriseValueMinorUnits: change.applyValueMinorUnits, lastActivityAt: new Date() },
    });
    await recordValuationObservation(db, {
      dealId,
      valueMinorUnits: change.applyValueMinorUnits,
      currency: deal.currency,
      observationType: "BUYER_INDICATION",
      source: "Email-derived valuation update",
      sourceEmailId,
      confidencePercent: Math.round(change.confidencePercent),
      observedAt: occurredAt,
    });
  }
  if (change.type === "STAGE_CHANGED" && change.applyStageId) {
    const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId }, select: { currentStageId: true } });
    await db.deal.update({
      where: { id: dealId },
      data: { previousStageId: deal.currentStageId, currentStageId: change.applyStageId, lastActivityAt: new Date() },
    });
  }
  await touchMeaningfulActivity(db, dealId, occurredAt);

  await db.dealEvent.create({
    data: {
      dealId,
      type: change.type === "DEAL_VALUE_CHANGED" ? "VALUE_CHANGE" : "STAGE_CHANGE",
      previousValue: change.previousValue,
      newValue: change.newValue,
      occurredAt,
      sourceEmailId,
      aiExtractionId,
      confidencePercent: Math.round(change.confidencePercent),
      note,
    },
  });
}
