import type { PrismaClient } from "@/generated/prisma/client";

// Valuation Intelligence (PHASE4_DEAL_INTELLIGENCE.md §22-25, §62-63).
// Every material valuation observation — not just the latest figure — gets
// its own DealValuationObservation row, so the deal detail page can show a
// real trend rather than only "current value."

export type ValuationObservationType =
  | "SELLER_EXPECTATION"
  | "BUYER_INDICATION"
  | "INDICATIVE_BID"
  | "FINAL_BID"
  | "AGREED_VALUE";

export interface RecordValuationObservationParams {
  dealId: string;
  valueMinorUnits: bigint;
  currency: string;
  observationType: ValuationObservationType;
  source: string;
  sourceEmailId?: string;
  confidencePercent: number;
  observedAt: Date;
}

export async function recordValuationObservation(db: PrismaClient, params: RecordValuationObservationParams) {
  return db.dealValuationObservation.create({
    data: {
      dealId: params.dealId,
      valueMinorUnits: params.valueMinorUnits,
      currency: params.currency,
      observationType: params.observationType,
      source: params.source,
      sourceEmailId: params.sourceEmailId,
      confidencePercent: Math.round(params.confidencePercent),
      observedAt: params.observedAt,
    },
  });
}

export async function getValuationHistory(db: PrismaClient, dealId: string) {
  return db.dealValuationObservation.findMany({ where: { dealId }, orderBy: { observedAt: "asc" } });
}

export interface ValuationChange {
  absoluteChangeMinorUnits: bigint;
  /** null when the previous value is missing or zero — spec §23: never divide by an invalid denominator. */
  percentChange: number | null;
  direction: "UP" | "DOWN" | "UNCHANGED";
}

export function computeValuationChange(previousMinorUnits: bigint | null, nextMinorUnits: bigint): ValuationChange {
  if (previousMinorUnits === null) {
    return { absoluteChangeMinorUnits: nextMinorUnits, percentChange: null, direction: "UP" };
  }
  const absoluteChangeMinorUnits = nextMinorUnits - previousMinorUnits;
  const percentChange = previousMinorUnits === 0n ? null : (Number(absoluteChangeMinorUnits) / Number(previousMinorUnits)) * 100;
  const direction = absoluteChangeMinorUnits > 0n ? "UP" : absoluteChangeMinorUnits < 0n ? "DOWN" : "UNCHANGED";
  return { absoluteChangeMinorUnits, percentChange, direction };
}

export type ValuationAlertSeverity = "NONE" | "MEDIUM" | "HIGH" | "CRITICAL";

// Configurable thresholds (spec §62), env-backed like the confidence policy
// and inactivity thresholds elsewhere in src/lib.
export function getValuationAlertThresholds() {
  return {
    mediumPercent: Number(process.env.VALUATION_ALERT_MEDIUM_PCT ?? 5),
    highPercent: Number(process.env.VALUATION_ALERT_HIGH_PCT ?? 10),
    criticalPercent: Number(process.env.VALUATION_ALERT_CRITICAL_PCT ?? 20),
  };
}

export function valuationAlertSeverity(percentChange: number | null): ValuationAlertSeverity {
  if (percentChange === null) return "NONE";
  const magnitude = Math.abs(percentChange);
  const thresholds = getValuationAlertThresholds();
  if (magnitude >= thresholds.criticalPercent) return "CRITICAL";
  if (magnitude >= thresholds.highPercent) return "HIGH";
  if (magnitude >= thresholds.mediumPercent) return "MEDIUM";
  return "NONE";
}

export function formatPercentChange(percentChange: number | null): string {
  if (percentChange === null) return "—";
  const sign = percentChange > 0 ? "+" : "";
  return `${sign}${percentChange.toFixed(2)}%`;
}
