import type { PrismaClient } from "@/generated/prisma/client";
import { computeMomentum } from "./momentum";
import { getOpenRisksForDeal, computeRiskScore, riskScoreLabel } from "./risk-engine";
import { assessDealInactivity } from "./inactivity";
import { getValuationHistory } from "./valuation";
import { generateRecommendedActions } from "./recommendations";
import { detectStageDelay } from "./stage";

// Assembles everything spec §51 wants at the top of Deal Detail in one
// bundle so the page component makes one call instead of wiring five
// separate service imports itself.
export async function getDealIntelligenceOverview(db: PrismaClient, dealId: string, organizationId: string) {
  const [momentum, openRisks, inactivity, valuationHistory, recommendedActionsAll, stageDelay] = await Promise.all([
    computeMomentum(db, dealId),
    getOpenRisksForDeal(db, dealId),
    assessDealInactivity(db, dealId),
    getValuationHistory(db, dealId),
    generateRecommendedActions(db, organizationId, { limit: 20 }),
    detectStageDelay(db, dealId),
  ]);

  return {
    momentum,
    openRisks,
    riskScore: computeRiskScore(openRisks),
    riskLabel: riskScoreLabel(computeRiskScore(openRisks)),
    inactivity,
    valuationHistory,
    recommendedActions: recommendedActionsAll.filter((a) => a.dealId === dealId),
    stageDelay,
  };
}

export type DealIntelligenceOverview = Awaited<ReturnType<typeof getDealIntelligenceOverview>>;
