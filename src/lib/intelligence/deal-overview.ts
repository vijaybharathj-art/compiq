import type { PrismaClient } from "@/generated/prisma/client";
import { computeMomentum } from "./momentum";
import { getOpenRisksForDeal, computeRiskScore, riskScoreLabel } from "./risk-engine";
import { assessDealInactivity } from "./inactivity";
import { getValuationHistory, computeValuationChange } from "./valuation";
import { generateRecommendedActions } from "./recommendations";
import { detectStageDelay, computeStageVelocity } from "./stage";

// Assembles everything spec §51 wants at the top of Deal Detail in one
// bundle so the page component makes one call instead of wiring five
// separate service imports itself.
export async function getDealIntelligenceOverview(db: PrismaClient, dealId: string, organizationId: string) {
  const [momentum, openRisks, inactivity, valuationHistory, recommendedActionsAll, stageDelay, stageVelocity] = await Promise.all([
    computeMomentum(db, dealId),
    getOpenRisksForDeal(db, dealId),
    assessDealInactivity(db, dealId),
    getValuationHistory(db, dealId),
    generateRecommendedActions(db, organizationId, { limit: 20 }),
    detectStageDelay(db, dealId),
    computeStageVelocity(db, dealId),
  ]);

  // Precomputed period-over-period change for the valuation timeline UI
  // (spec §23) — reuses the same computeValuationChange() the pipeline's
  // own valuation intelligence uses, never a UI-side re-derivation.
  const valuationWithChange = valuationHistory.map((observation, index) => ({
    observation,
    change: index === 0 ? null : computeValuationChange(valuationHistory[index - 1]!.valueMinorUnits, observation.valueMinorUnits),
  }));

  const riskSeverityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const r of openRisks) riskSeverityCounts[r.severity] += 1;

  return {
    momentum,
    openRisks,
    riskScore: computeRiskScore(openRisks),
    riskLabel: riskScoreLabel(computeRiskScore(openRisks)),
    riskSeverityCounts,
    inactivity,
    valuationHistory: valuationWithChange,
    recommendedActions: recommendedActionsAll.filter((a) => a.dealId === dealId),
    stageDelay,
    stageVelocity,
  };
}

export type DealIntelligenceOverview = Awaited<ReturnType<typeof getDealIntelligenceOverview>>;
