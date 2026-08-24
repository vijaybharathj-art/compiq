import type { PrismaClient } from "@/generated/prisma/client";
import type { ExtractionResult } from "@/lib/ai/extraction-schema";
import type { DetectedChange } from "./types";

// Change detection stage (spec §14-15). Compares a new extraction against
// the currently matched deal's live state and reports only concrete,
// well-evidenced differences — never inferring a stage change from vague
// sentiment (the extraction stage already withholds stageKey in that case;
// this stage just diffs whatever it was given).

export async function detectChanges(
  db: PrismaClient,
  dealId: string,
  extraction: ExtractionResult,
): Promise<DetectedChange[]> {
  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { currentStage: true, workflow: { include: { stages: true } } },
  });

  const changes: DetectedChange[] = [];

  const newValueMinor = extraction.enterpriseValue?.amountMinorUnits ?? extraction.dealValue?.amountMinorUnits;
  if (typeof newValueMinor === "number") {
    const newValueBig = BigInt(newValueMinor);
    const currentValue = deal.enterpriseValueMinorUnits ?? deal.valueMinorUnits;
    if (currentValue === null || currentValue !== newValueBig) {
      changes.push({
        type: "DEAL_VALUE_CHANGED",
        previousValue: currentValue !== null ? formatMoney(currentValue, deal.currency) : "unset",
        newValue: formatMoney(newValueBig, extraction.enterpriseValue?.currency ?? extraction.dealValue?.currency ?? deal.currency),
        confidencePercent: extraction.valueConfidencePercent ?? extraction.confidencePercent,
        applyValueMinorUnits: newValueBig,
      });
    }
  }

  if (extraction.stageKey) {
    const targetStage = deal.workflow.stages.find((s) => s.key === extraction.stageKey);
    if (targetStage && targetStage.id !== deal.currentStageId) {
      // Never report a *backward* move as confidently as a forward one —
      // the extraction stage's phrase-based detector is tuned for forward
      // language ("proceed to", "would like to"), so a lower sortOrder
      // here more likely means a different deal's stage vocabulary
      // coincidentally matched than a real regression.
      const isForward = targetStage.sortOrder > deal.currentStage.sortOrder;
      changes.push({
        type: "STAGE_CHANGED",
        previousValue: deal.currentStage.label,
        newValue: targetStage.label,
        confidencePercent: isForward
          ? (extraction.stageConfidencePercent ?? extraction.confidencePercent)
          : Math.min(extraction.stageConfidencePercent ?? extraction.confidencePercent, 65),
        applyStageId: targetStage.id,
      });
    }
  }

  return changes;
}

function formatMoney(minorUnits: bigint, currency: string): string {
  const amount = Number(minorUnits) / 100;
  if (amount >= 1_000_000_000) return `${currency} ${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(0)}M`;
  return `${currency} ${amount.toLocaleString()}`;
}
