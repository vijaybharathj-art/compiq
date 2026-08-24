import { describe, expect, it } from "vitest";
import { computeImportanceScore, importanceTier } from "@/lib/intelligence/importance";
import { classifyRiskType, baseSeverityForSignal } from "@/lib/intelligence/risk-engine";
import { classifyInactivity, stageThresholdMultiplier, businessDaysBetween } from "@/lib/intelligence/inactivity";
import { computeValuationChange, valuationAlertSeverity, formatPercentChange } from "@/lib/intelligence/valuation";
import { bucketDeadline, deadlineUrgency } from "@/lib/intelligence/deadline";

// Automated tests for the required cases (PHASE4_DEAL_INTELLIGENCE.md §72),
// exercised directly against the deterministic engines — no AI call, no
// database — so these describe the documented scoring/classification
// contract itself.

const NOW = new Date("2026-08-23T18:00:00Z");

describe("Test 1 — stage change is high-importance", () => {
  it("a STAGE_CHANGED event on a high-value deal scores in the HIGH/CRITICAL tier", () => {
    const score = computeImportanceScore({
      eventType: "STAGE_CHANGED",
      dealValueMinorUnits: 750_000_000_00,
      dealPriority: "HIGH",
      confidencePercent: 96,
      requiresAction: false,
      occurredAt: NOW,
      now: NOW,
    });
    expect(score).toBeGreaterThanOrEqual(75);
    expect(["HIGH", "CRITICAL"]).toContain(importanceTier(score));
  });
});

describe("Test 2 — Orion valuation change ($390M → $420M)", () => {
  it("computes +$30M and +7.69%", () => {
    const change = computeValuationChange(390_000_000_00n, 420_000_000_00n);
    expect(change.absoluteChangeMinorUnits).toBe(30_000_000_00n);
    expect(change.direction).toBe("UP");
    expect(change.percentChange).not.toBeNull();
    expect(change.percentChange!).toBeCloseTo(7.6923, 3);
    expect(formatPercentChange(change.percentChange)).toBe("+7.69%");
  });

  it("never divides by a zero or missing previous value", () => {
    expect(computeValuationChange(0n, 100_00n).percentChange).toBeNull();
    expect(computeValuationChange(null, 100_00n).percentChange).toBeNull();
  });

  it("a >5% valuation move triggers at least a MEDIUM alert", () => {
    const change = computeValuationChange(390_000_000_00n, 420_000_000_00n);
    expect(valuationAlertSeverity(change.percentChange)).not.toBe("NONE");
  });
});

describe("Test 3 — Atlas: 8 days inactive in a late stage", () => {
  it("classifies as INACTIVE at a late-stage multiplier", () => {
    const thresholds = { watchDays: 4, inactiveDays: 7, staleDays: 14 };
    const status = classifyInactivity(8, thresholds, stageThresholdMultiplier(9, 10)); // near end of workflow
    expect(status).toBe("INACTIVE");
  });
});

describe("Test 4 — early-stage pitch: 10 days without activity is not automatically high risk", () => {
  it("an early-stage deal with a longer natural gap does not read as INACTIVE/STALE", () => {
    const thresholds = { watchDays: 4, inactiveDays: 7, staleDays: 14 };
    const status = classifyInactivity(10, thresholds, stageThresholdMultiplier(0, 10)); // start of workflow
    expect(status).not.toBe("STALE");
    expect(["ACTIVE", "WATCH", "INACTIVE"]).toContain(status);
    // Specifically: the early-stage multiplier (1.5x) keeps 10 days under
    // the inactive threshold (7 * 1.5 = 10.5), unlike a late-stage deal.
    expect(status).toBe("WATCH");
  });
});

describe("Test 5 — 'concerns about valuation' is a potential valuation risk", () => {
  it("classifies as VALUATION_PRESSURE, not a confirmed fact", () => {
    const type = classifyRiskType("Potential risk detected: we have concerns about valuation.");
    expect(type).toBe("VALUATION_PRESSURE");
  });
});

describe("Test 6 — 'may withdraw from the process' is a high risk signal", () => {
  it("classifies as BUYER_CONCERN with HIGH severity", () => {
    const text = "Potential risk detected: buyer may withdraw from the process.";
    const type = classifyRiskType(text);
    expect(type).toBe("BUYER_CONCERN");
    expect(baseSeverityForSignal(type, text)).toBe("HIGH");
  });
});

describe("Test 7 — deadline tomorrow is high priority", () => {
  it("deadlineUrgency for tomorrow is HIGH", () => {
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(deadlineUrgency(tomorrow, NOW)).toBe("HIGH");
    expect(bucketDeadline(tomorrow, NOW)).toBe("TOMORROW");
  });
});

describe("Test 8 — deadline 2 days overdue is critical/overdue", () => {
  it("deadlineUrgency for 2 days ago is CRITICAL and buckets as OVERDUE", () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(deadlineUrgency(twoDaysAgo, NOW)).toBe("CRITICAL");
    expect(bucketDeadline(twoDaysAgo, NOW)).toBe("OVERDUE");
  });
});

describe("businessDaysBetween", () => {
  it("excludes weekends", () => {
    // Mon Aug 10 -> Sun Aug 23 (date-only) = 9 weekdays.
    const from = new Date("2026-08-10T11:25:00Z");
    const to = new Date("2026-08-23T18:00:00Z");
    expect(businessDaysBetween(from, to)).toBe(9);
  });
});
