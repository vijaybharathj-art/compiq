import type { IntelligenceEventType } from "@/lib/pipeline/intelligence-events";
import type { DealPriority } from "@/types/domain";

// Deterministic importance scoring (PHASE4_DEAL_INTELLIGENCE.md §5/§66).
// Never delegated to an AI call — every input is a fact already in the
// database, and the formula is documented in full below so a banker (or an
// engineer debugging a ranking) can see exactly why one event outranks
// another. Pure function: same inputs always produce the same score.
//
// Score = clamp(0, 100,
//   ( eventTypeBase(eventType)
//     + dealMateriality(valueMinorUnits)
//     + dealPriorityBonus(priority)
//     + urgencyBonus(deadlineDaysAway)
//     + riskBonus(riskSeverity)
//     + (requiresAction ? ACTION_BONUS : 0)
//   ) * confidenceMultiplier(confidencePercent)
//     * recencyMultiplier(occurredAt, now)
// )

export type RiskSeverityInput = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null | undefined;

export interface ImportanceInput {
  eventType: IntelligenceEventType;
  dealValueMinorUnits?: bigint | number | null;
  dealPriority?: DealPriority | null;
  confidencePercent?: number | null;
  requiresAction?: boolean;
  deadlineDaysAway?: number | null;
  riskSeverity?: RiskSeverityInput;
  occurredAt: Date;
  now?: Date;
}

const EVENT_TYPE_BASE: Record<IntelligenceEventType, number> = {
  DEAL_CREATED: 45,
  DEAL_VALUE_CHANGED: 55,
  STAGE_CHANGED: 55,
  BUYER_ADDED: 40,
  BUYER_REMOVED: 40,
  MANDATE_CHANGED: 50,
  DEADLINE_DETECTED: 40,
  TASK_CREATED: 30,
  RISK_DETECTED: 50,
  OPPORTUNITY_DETECTED: 35,
  CLIENT_ACTIVITY: 20,
  IMPORTANT_EMAIL: 25,
  DEAL_INACTIVE: 45,
};

const ACTION_BONUS = 10;

function dealMateriality(valueMinorUnits?: bigint | number | null): number {
  if (valueMinorUnits === null || valueMinorUnits === undefined) return 0;
  const amount = Number(valueMinorUnits) / 100;
  if (amount >= 1_000_000_000) return 20;
  if (amount >= 500_000_000) return 15;
  if (amount >= 100_000_000) return 10;
  if (amount >= 25_000_000) return 5;
  return 0;
}

function dealPriorityBonus(priority?: DealPriority | null): number {
  switch (priority) {
    case "CRITICAL":
      return 15;
    case "HIGH":
      return 10;
    case "MEDIUM":
      return 5;
    default:
      return 0;
  }
}

function urgencyBonus(deadlineDaysAway?: number | null): number {
  if (deadlineDaysAway === null || deadlineDaysAway === undefined) return 0;
  if (deadlineDaysAway <= 0) return 20; // today or overdue
  if (deadlineDaysAway <= 1) return 15; // tomorrow
  if (deadlineDaysAway <= 3) return 10;
  if (deadlineDaysAway <= 7) return 5;
  return 0;
}

function riskBonus(severity: RiskSeverityInput): number {
  switch (severity) {
    case "CRITICAL":
      return 25;
    case "HIGH":
      return 15;
    case "MEDIUM":
      return 8;
    case "LOW":
      return 3;
    default:
      return 0;
  }
}

function confidenceMultiplier(confidencePercent?: number | null): number {
  if (confidencePercent === null || confidencePercent === undefined) return 1;
  const clamped = Math.max(0, Math.min(100, confidencePercent));
  return 0.6 + 0.4 * (clamped / 100);
}

function recencyMultiplier(occurredAt: Date, now: Date): number {
  const hoursAgo = (now.getTime() - occurredAt.getTime()) / (1000 * 60 * 60);
  if (hoursAgo <= 24) return 1;
  if (hoursAgo <= 72) return 0.9;
  if (hoursAgo <= 168) return 0.75;
  return 0.6;
}

export function computeImportanceScore(input: ImportanceInput): number {
  const now = input.now ?? new Date();
  const base =
    EVENT_TYPE_BASE[input.eventType] +
    dealMateriality(input.dealValueMinorUnits) +
    dealPriorityBonus(input.dealPriority) +
    urgencyBonus(input.deadlineDaysAway) +
    riskBonus(input.riskSeverity) +
    (input.requiresAction ? ACTION_BONUS : 0);

  const scored = base * confidenceMultiplier(input.confidencePercent) * recencyMultiplier(input.occurredAt, now);
  return Math.max(0, Math.min(100, Math.round(scored)));
}

export type ImportanceTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";

export function importanceTier(score: number): ImportanceTier {
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 25) return "LOW";
  return "INFORMATIONAL";
}
