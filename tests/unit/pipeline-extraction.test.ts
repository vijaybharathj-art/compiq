import { describe, expect, it } from "vitest";
import { DemoAIProvider } from "@/lib/ai/demo-provider";
import { decideConfidenceAction } from "@/lib/ai/confidence-policy";
import { parseDeadline, detectStageSignal, detectMoneySignal } from "@/lib/ai/extractors";
import type { ClassificationContext, DealContext, EmailInput } from "@/lib/ai/types";

// Automated tests for the 8 required cases (PHASE3_EMAIL_INTELLIGENCE.md
// §29), exercised directly against DemoAIProvider — the same interface a
// real LLM provider would implement, so these assertions describe the
// contract, not an implementation detail.

const provider = new DemoAIProvider();

function email(bodyText: string, overrides: Partial<EmailInput> = {}): EmailInput {
  return {
    emailId: "test-email",
    fromAddress: "contact@example.com",
    toAddresses: ["bharath.vijay@tattava-demo.bank"],
    ccAddresses: [],
    subject: "Test",
    bodyText,
    sentAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

const emptyDealContext: DealContext = { organizationId: "org-test", candidateDeals: [] };

const noSignalContext: ClassificationContext = {
  threadAlreadyLinkedToDeal: false,
  senderIsKnownContact: false,
  senderIsInternalBanker: false,
  knownClientNames: [],
  knownCompanyNames: [],
  priorRelevantEmailsInThread: 0,
};

describe("Test 1 — explicit deal value is extracted with high confidence", () => {
  it('"Enterprise value is $750M." extracts $750M with a confirmed (non-hedged) signal', async () => {
    const result = await provider.extractEntities(email("Enterprise value is $750M."), emptyDealContext);
    expect(result.enterpriseValue?.amountMinorUnits).toBe(750_000_000_00);
    expect(result.valueConfidencePercent ?? result.confidencePercent).toBeGreaterThanOrEqual(90);
    expect(decideConfidenceAction(result.valueConfidencePercent ?? result.confidencePercent)).toBe("AUTO_APPLY");
  });
});

describe("Test 2 — hedged value language requires review, not auto-apply", () => {
  it('"We think $750M could be achievable." extracts the same figure at lower confidence', async () => {
    const result = await provider.extractEntities(
      email("We think $750M could be achievable."),
      emptyDealContext,
    );
    // Unlabeled figures ("$750M" with no "enterprise value"/"equity value"
    // phrase) land in dealValue — the same enterpriseValue ?? dealValue
    // union src/lib/pipeline/change-detection.ts reads when applying it.
    const value = result.enterpriseValue ?? result.dealValue;
    expect(value?.amountMinorUnits).toBe(750_000_000_00);
    const confidence = result.valueConfidencePercent ?? result.confidencePercent;
    expect(confidence).toBeLessThan(90);
    expect(decideConfidenceAction(confidence)).not.toBe("AUTO_APPLY");
  });
});

describe("Test 3 — a management-meeting request implies a stage signal and a task", () => {
  it('"Buyer would like to meet management next week." produces stageKey + a scheduling action', async () => {
    const result = await provider.extractEntities(
      email("Buyer would like to meet management next week."),
      emptyDealContext,
    );
    expect(result.stageKey).toBe("management_meetings");
    expect(result.actions.some((a) => /management meeting/i.test(a))).toBe(true);
    expect(result.meetings.some((m) => m.type === "MANAGEMENT_MEETING")).toBe(true);
  });
});

describe("Test 4 — vague sentiment never implies a stage change", () => {
  it('"Good discussion today." does not set a stageKey', async () => {
    const result = await provider.extractEntities(email("Good discussion today."), emptyDealContext);
    expect(result.stageKey ?? null).toBeNull();
  });

  it("the stage-signal detector itself finds nothing in vague sentiment", () => {
    expect(detectStageSignal("Good discussion today.")).toBeNull();
  });
});

describe("Test 5 — 'valuation' with no deal/client anchor is not confidently relevant", () => {
  it("a training-session email mentioning valuation is not classified IB_RELEVANT", async () => {
    const result = await provider.classifyRelevance(
      email("Don't forget the internal valuation training session Thursday at 10am."),
      noSignalContext,
    );
    expect(result.relevance).not.toBe("IB_RELEVANT");
  });
});

describe("Test 7 — a possible new transaction is an opportunity, not a confirmed deal", () => {
  it("matchDeal returns POTENTIAL_OPPORTUNITY, never EXISTING_DEAL, for an opportunity signal with no candidates", async () => {
    const extraction = await provider.extractEntities(
      email("We at Halcyon Materials are considering acquiring a regional competitor."),
      emptyDealContext,
    );
    expect(extraction.opportunitySignal).toBe(true);

    const match = await provider.matchDeal(extraction, []);
    expect(match.matchType).toBe("POTENTIAL_OPPORTUNITY");
  });
});

describe("Test 8 — an explicit deadline is extracted and normalized", () => {
  const referenceDate = new Date("2026-08-20T10:00:00.000Z"); // a Thursday

  it('parseDeadline("...by Friday.") normalizes to the very next day', () => {
    const deadline = parseDeadline("We need the EBITDA bridge by Friday.", referenceDate);
    expect(deadline).not.toBeNull();
    expect(deadline!.originalText.toLowerCase()).toContain("friday");
    expect(deadline!.normalizedDate).toBe("2026-08-21");
    expect(deadline!.confidencePercent).toBeGreaterThanOrEqual(85);
  });

  it("does not invent a date for ambiguous phrasing", () => {
    const deadline = parseDeadline("Let's plan to close before the IC meeting.", referenceDate);
    expect(deadline).not.toBeNull();
    expect(deadline!.normalizedDate).toBeNull();
  });

  it("extractEntities surfaces the deadline and a matching task action end-to-end", async () => {
    const result = await provider.extractEntities(
      email("We need the EBITDA bridge by Friday to keep the timetable on track.", {
        sentAt: referenceDate.toISOString(),
      }),
      emptyDealContext,
    );
    expect(result.deadline?.normalizedDate).toBe("2026-08-21");
    expect(result.actions.length).toBeGreaterThan(0);
  });
});

describe("money and stage extractor primitives", () => {
  it("detectMoneySignal flags hedged phrasing as lower-confidence than a direct statement", () => {
    const direct = detectMoneySignal("The price is $500M.");
    const hedged = detectMoneySignal("We think $500M could be achievable.");
    expect(direct?.hedged).toBe(false);
    expect(hedged?.hedged).toBe(true);
    expect(hedged!.confidencePercent).toBeLessThan(direct!.confidencePercent);
  });
});
