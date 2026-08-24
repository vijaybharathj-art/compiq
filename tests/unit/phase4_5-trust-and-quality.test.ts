import { describe, expect, it } from "vitest";
import { trustStatusFromConfidence } from "@/components/shared/badges";
import { recommendedActionText } from "@/lib/intelligence/recommendations";
import { detectMoneySignal } from "@/lib/ai/extractors";
import { decideConfidenceAction } from "@/lib/ai/confidence-policy";

// PHASE4_5_PRODUCTION_HARDENING.md — trust layer + data quality coverage
// (spec §62-66). Exercised directly against the deterministic functions
// the trust layer / recommendation engine / confidence policy are built
// from, no database or AI call required.

describe("Trust layer — confidence is never fabricated, tiers match the confidence policy", () => {
  it("maps >=90 to HIGH, >=70 to MEDIUM, below 70 to LOW", () => {
    expect(trustStatusFromConfidence(96)).toBe("HIGH");
    expect(trustStatusFromConfidence(90)).toBe("HIGH");
    expect(trustStatusFromConfidence(89)).toBe("MEDIUM");
    expect(trustStatusFromConfidence(70)).toBe("MEDIUM");
    expect(trustStatusFromConfidence(69)).toBe("LOW");
    expect(trustStatusFromConfidence(0)).toBe("LOW");
  });

  it("returns null (never a fabricated tier) when no confidence value exists", () => {
    expect(trustStatusFromConfidence(null)).toBeNull();
    expect(trustStatusFromConfidence(undefined)).toBeNull();
  });
});

describe("Recommendation engine — never freestanding generic advice", () => {
  it("returns a templated recommendation for a covered event type", () => {
    const text = recommendedActionText("DEAL_INACTIVE", "Deal inactive", "Project Falcon");
    expect(text).toBe("Follow up with the Project Falcon client contact.");
  });

  it("returns null (never a fabricated fallback) for an event type with no template", () => {
    expect(recommendedActionText("CLIENT_ACTIVITY", "Client reached out", "Project Falcon")).toBeNull();
    expect(recommendedActionText("IMPORTANT_EMAIL", "Important email", "Project Falcon")).toBeNull();
  });
});

describe("False-positive safety net — an incidental dollar mention (spec §65-66)", () => {
  // A market-report reference to a transaction unrelated to the deal in
  // this thread — the kind of email spec §65's negative golden test names
  // explicitly. detectMoneySignal() has no notion of "is this about MY
  // deal," only hedge/confirm phrasing near the number, so this documents
  // its real, current behavior rather than an aspirational one.
  const incidentalMention = "Please see the attached market report. It references a $420M transaction elsewhere in the sector.";

  it("detectMoneySignal still extracts the figure — it is not judged as unrelated", () => {
    const signal = detectMoneySignal(incidentalMention);
    expect(signal).not.toBeNull();
    expect(signal!.hedged).toBe(false);
    expect(signal!.confidencePercent).toBe(88);
  });

  it("the confidence policy is the actual safety net: 88% never reaches AUTO_APPLY, only human review", () => {
    // Never below AI_REVIEW_THRESHOLD (70) either — an incidental mention
    // is not nothing, it genuinely deserves a banker's second look, just
    // never an unattended deal mutation.
    expect(decideConfidenceAction(88)).toBe("SUGGESTED_PENDING");
    expect(decideConfidenceAction(88)).not.toBe("AUTO_APPLY");
  });
});
