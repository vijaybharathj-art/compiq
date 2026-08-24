// Confidence policy (spec §18) — the thresholds that decide whether an
// extraction auto-applies, requires human review, or is stored as
// low-confidence intelligence only. Configurable via environment
// variables so an organization can tune its own risk tolerance without a
// code change; AI_EXTRACTION_SPEC.md §7 documents the defaults below.

export interface ConfidencePolicy {
  autoApplyThreshold: number;
  reviewThreshold: number;
}

export function getConfidencePolicy(): ConfidencePolicy {
  const autoApplyThreshold = Number(process.env.AI_AUTO_APPLY_THRESHOLD ?? 90);
  const reviewThreshold = Number(process.env.AI_REVIEW_THRESHOLD ?? 70);
  return {
    autoApplyThreshold: Number.isFinite(autoApplyThreshold) ? autoApplyThreshold : 90,
    reviewThreshold: Number.isFinite(reviewThreshold) ? reviewThreshold : 70,
  };
}

export type ConfidenceDecision = "AUTO_APPLY" | "SUGGESTED_PENDING" | "INFO_ONLY";

export function decideConfidenceAction(
  confidencePercent: number,
  policy: ConfidencePolicy = getConfidencePolicy(),
): ConfidenceDecision {
  if (confidencePercent >= policy.autoApplyThreshold) return "AUTO_APPLY";
  if (confidencePercent >= policy.reviewThreshold) return "SUGGESTED_PENDING";
  return "INFO_ONLY";
}
