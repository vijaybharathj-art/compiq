import type { PrismaClient } from "@/generated/prisma/client";

// Deal Risk Engine (PHASE4_DEAL_INTELLIGENCE.md §12-15, §60-61). The goal
// is never "predict failure" — it's "flag signals that deserve a banker's
// attention." Classification is deterministic phrase-matching (spec §67:
// AI does detection/wording, rules do categorization/thresholds) over the
// same risk-signal phrases src/lib/ai/extractors.ts already produces, so
// behavior stays fully testable and auditable.

export type RiskType =
  | "CLIENT_SILENCE"
  | "BUYER_CONCERN"
  | "VALUATION_PRESSURE"
  | "TIMELINE_DELAY"
  | "FINANCING_UNCERTAINTY"
  | "DILIGENCE_ISSUE"
  | "COMPETITIVE_PRESSURE"
  | "MANAGEMENT_CONCERN"
  | "DEAL_STALL"
  | "UNRESPONSIVE_COUNTERPARTY"
  | "OTHER";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const TYPE_RULES: { type: RiskType; test: RegExp }[] = [
  { type: "BUYER_CONCERN", test: /withdraw/i },
  { type: "CLIENT_SILENCE", test: /no response from client|hasn'?t responded|has not responded|gone quiet|gone silent/i },
  { type: "VALUATION_PRESSURE", test: /concerns? (regarding|about) valuation/i },
  { type: "TIMELINE_DELAY", test: /timeline may (need to be pushed|slip)|pushed back/i },
  { type: "FINANCING_UNCERTAINTY", test: /financing remains unresolved/i },
  { type: "MANAGEMENT_CONCERN", test: /reconsidering|may reconsider/i },
  { type: "BUYER_CONCERN", test: /concerns? (regarding|about)/i },
];

export function classifyRiskType(signalText: string): RiskType {
  const match = TYPE_RULES.find((rule) => rule.test.test(signalText));
  return match?.type ?? "OTHER";
}

const BASE_SEVERITY: Record<RiskType, RiskSeverity> = {
  BUYER_CONCERN: "MEDIUM",
  CLIENT_SILENCE: "MEDIUM",
  VALUATION_PRESSURE: "MEDIUM",
  TIMELINE_DELAY: "MEDIUM",
  FINANCING_UNCERTAINTY: "MEDIUM",
  DILIGENCE_ISSUE: "MEDIUM",
  COMPETITIVE_PRESSURE: "LOW",
  MANAGEMENT_CONCERN: "HIGH",
  DEAL_STALL: "HIGH",
  UNRESPONSIVE_COUNTERPARTY: "MEDIUM",
  OTHER: "LOW",
};

// Explicit, unambiguous language (withdrawal threats) escalates on
// detection regardless of history — spec §14's worked example ("Buyer is
// considering withdrawing" → HIGH/CRITICAL).
const SEVERITY_ESCALATING_PATTERN = /withdraw/i;

const SEVERITY_ORDER: RiskSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function escalateSeverity(severity: RiskSeverity, levels = 1): RiskSeverity {
  const index = Math.min(SEVERITY_ORDER.length - 1, SEVERITY_ORDER.indexOf(severity) + levels);
  return SEVERITY_ORDER[index]!;
}

export function baseSeverityForSignal(riskType: RiskType, signalText: string): RiskSeverity {
  const base = BASE_SEVERITY[riskType];
  return SEVERITY_ESCALATING_PATTERN.test(signalText) ? escalateSeverity(base) : base;
}

export interface RecordRiskParams {
  organizationId: string;
  dealId: string;
  signalText: string;
  confidencePercent: number;
  sourceEmailId?: string;
  intelligenceEventId: string;
  detectedAt: Date;
}

export interface RecordRiskResult {
  riskType: RiskType;
  severity: RiskSeverity;
  momentumWeakening: boolean;
  relatedOpenRiskCount: number;
}

// A deal accumulating multiple unresolved risk signals in a short window
// represents deteriorating momentum even if no single signal is severe on
// its own (spec §15). ACCUMULATION_WINDOW_DAYS bounds "recent"; the
// threshold of 2 *other* open/unresolved risks triggers one severity bump.
const ACCUMULATION_WINDOW_DAYS = 14;
const ACCUMULATION_THRESHOLD = 2;

export async function recordRisk(db: PrismaClient, params: RecordRiskParams): Promise<RecordRiskResult> {
  const riskType = classifyRiskType(params.signalText);
  let severity = baseSeverityForSignal(riskType, params.signalText);

  const windowStart = new Date(params.detectedAt.getTime() - ACCUMULATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const relatedOpenRiskCount = await db.risk.count({
    where: {
      dealId: params.dealId,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      detectedAt: { gte: windowStart },
    },
  });

  const momentumWeakening = relatedOpenRiskCount >= ACCUMULATION_THRESHOLD;
  if (momentumWeakening) severity = escalateSeverity(severity);

  await db.risk.create({
    data: {
      organizationId: params.organizationId,
      dealId: params.dealId,
      riskType,
      description: params.signalText,
      confidencePercent: Math.round(params.confidencePercent),
      severity,
      sourceEmailId: params.sourceEmailId,
      intelligenceEventId: params.intelligenceEventId,
      status: "OPEN",
      detectedAt: params.detectedAt,
    },
  });

  return { riskType, severity, momentumWeakening, relatedOpenRiskCount };
}

// Non-financial 0-100 "how many concerning signals exist" score for a deal
// (spec §60-61) — deliberately labeled DEAL RISK SIGNAL in the UI, never
// "probability of failure." Kept separate from momentum (src/lib/intelligence/momentum.ts).
const SEVERITY_WEIGHT: Record<RiskSeverity, number> = { LOW: 8, MEDIUM: 18, HIGH: 30, CRITICAL: 45 };

export function computeRiskScore(openRisks: { severity: RiskSeverity }[]): number {
  const total = openRisks.reduce((sum, r) => sum + SEVERITY_WEIGHT[r.severity], 0);
  return Math.max(0, Math.min(100, total));
}

export function riskScoreLabel(score: number): "Minimal" | "Low" | "Moderate" | "Elevated" | "Severe" {
  if (score >= 80) return "Severe";
  if (score >= 55) return "Elevated";
  if (score >= 30) return "Moderate";
  if (score >= 10) return "Low";
  return "Minimal";
}

export async function getOpenRisksForDeal(db: PrismaClient, dealId: string) {
  return db.risk.findMany({
    where: { dealId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    orderBy: { detectedAt: "desc" },
  });
}

export async function getRiskScoreForDeal(db: PrismaClient, dealId: string): Promise<number> {
  const openRisks = await getOpenRisksForDeal(db, dealId);
  return computeRiskScore(openRisks);
}
