// Shared types for the email intelligence pipeline
// (PHASE3_EMAIL_INTELLIGENCE.md §1). Each stage in src/lib/pipeline/ is a
// small, independently callable function; the orchestrator
// (src/lib/pipeline/orchestrator.ts) composes them per email.

export type DetectedChangeType =
  | "DEAL_VALUE_CHANGED"
  | "STAGE_CHANGED"
  | "MANDATE_CHANGED";

export interface DetectedChange {
  type: DetectedChangeType;
  previousValue: string;
  newValue: string;
  confidencePercent: number;
  /** For STAGE_CHANGED, the resolved DealStageDefinition id to apply. */
  applyStageId?: string;
  /** For DEAL_VALUE_CHANGED, the resolved minor-units value to apply. */
  applyValueMinorUnits?: bigint;
  /** For DEAL_VALUE_CHANGED, the prior raw value (null if previously unset) — used for percent-change display. */
  previousValueMinorUnits?: bigint | null;
}

export interface ScanCounters {
  totalEmails: number;
  processedCount: number;
  relevantCount: number;
  dealsUpdated: number;
  tasksCreated: number;
  opportunitiesCreated: number;
  risksDetected: number;
  suggestionsForReview: number;
}

export function emptyScanCounters(): ScanCounters {
  return {
    totalEmails: 0,
    processedCount: 0,
    relevantCount: 0,
    dealsUpdated: 0,
    tasksCreated: 0,
    opportunitiesCreated: 0,
    risksDetected: 0,
    suggestionsForReview: 0,
  };
}
