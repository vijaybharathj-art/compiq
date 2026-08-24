import { describe, expect, it } from "vitest";
import { DemoAIProvider } from "@/lib/ai/demo-provider";
import { decideConfidenceAction } from "@/lib/ai/confidence-policy";
import { detectStageSignal, detectMoneySignal, parseDeadline, detectRiskSignals, detectOpportunitySignal } from "@/lib/ai/extractors";
import { normalizeBody } from "@/lib/pipeline/normalization";
import type { ClassificationContext } from "@/lib/ai/types";
import {
  GOLDEN_EMAIL_SCENARIOS,
  NORMAL_DEAL_SCENARIOS,
  STAGE_CHANGE_SCENARIOS,
  VALUATION_CHANGE_SCENARIOS,
  DEADLINE_SCENARIOS,
  RISK_SCENARIOS,
  OPPORTUNITY_SCENARIOS,
  IRRELEVANT_SCENARIOS,
  toEmailInput,
} from "../fixtures/phase5-golden-emails";

// The golden synthetic email dataset (PHASE5_REAL_EMAIL_INTEGRATION.md
// §69) exercised against the real, deterministic classifier/extractor —
// every assertion below reflects verified behavior (see
// tests/fixtures/phase5-golden-emails.ts's header), not an assumption.
// Every body is invented for this suite; none is real correspondence
// (spec's explicit "no real confidential banking emails in tests"
// constraint).

const provider = new DemoAIProvider();

const NO_CONTEXT: ClassificationContext = {
  threadAlreadyLinkedToDeal: false,
  senderIsKnownContact: false,
  senderIsInternalBanker: false,
  knownClientNames: [],
  knownCompanyNames: [],
  priorRelevantEmailsInThread: 0,
};

describe("golden dataset — coverage", () => {
  it("has at least 50 scenarios across the 8 required categories", () => {
    expect(GOLDEN_EMAIL_SCENARIOS.length).toBeGreaterThanOrEqual(50);
    expect(NORMAL_DEAL_SCENARIOS.length).toBe(20);
    expect(STAGE_CHANGE_SCENARIOS.length).toBe(5);
    expect(VALUATION_CHANGE_SCENARIOS.length).toBe(5);
    expect(DEADLINE_SCENARIOS.length).toBe(5);
    expect(RISK_SCENARIOS.length).toBe(5);
    expect(OPPORTUNITY_SCENARIOS.length).toBe(5);
    expect(IRRELEVANT_SCENARIOS.length).toBe(5);
  });

  it("every scenario id is unique", () => {
    const ids = GOLDEN_EMAIL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("golden dataset — NORMAL_DEAL scenarios classify IB_RELEVANT on content alone", () => {
  for (const s of NORMAL_DEAL_SCENARIOS) {
    it(`${s.id}: "${s.subject}"`, async () => {
      const result = await provider.classifyRelevance(toEmailInput(s), NO_CONTEXT);
      expect(result.relevance).toBe("IB_RELEVANT");
    });
  }
});

describe("golden dataset — STAGE_CHANGE scenarios", () => {
  const expectedStageKeys: Record<string, string> = {
    "sc-01": "management_meetings",
    "sc-02": "due_diligence",
    "sc-03": "indicative_bids",
    "sc-04": "final_bids",
    "sc-05": "closing",
  };

  for (const s of STAGE_CHANGE_SCENARIOS) {
    it(`${s.id}: detects stageKey "${expectedStageKeys[s.id]}" and is IB_RELEVANT`, async () => {
      const relevance = await provider.classifyRelevance(toEmailInput(s), NO_CONTEXT);
      expect(relevance.relevance).toBe("IB_RELEVANT");

      const signal = detectStageSignal(`${s.subject}\n${s.bodyText}`);
      expect(signal?.stageKey).toBe(expectedStageKeys[s.id]);
    });
  }
});

describe("golden dataset — VALUATION_CHANGE scenarios: positive valuation-change golden test", () => {
  const expected: Record<string, { amountMinorUnits: number; valueLabel: "enterprise" | "equity" }> = {
    "vc-01": { amountMinorUnits: 825_000_000_00, valueLabel: "enterprise" },
    "vc-02": { amountMinorUnits: 410_000_000_00, valueLabel: "equity" },
    "vc-03": { amountMinorUnits: 1_200_000_000_00, valueLabel: "enterprise" },
    "vc-04": { amountMinorUnits: 95_000_000_00, valueLabel: "equity" },
    "vc-05": { amountMinorUnits: 610_000_000_00, valueLabel: "enterprise" },
  };

  for (const s of VALUATION_CHANGE_SCENARIOS) {
    it(`${s.id}: extracts a confirmed, non-hedged value that clears AUTO_APPLY`, async () => {
      const extraction = await provider.extractEntities(toEmailInput(s), { organizationId: "org-test", candidateDeals: [] });
      const value = extraction.enterpriseValue ?? extraction.equityValue;
      expect(value?.amountMinorUnits).toBe(expected[s.id]!.amountMinorUnits);

      const money = detectMoneySignal(`${s.subject}\n${s.bodyText}`);
      expect(money?.hedged).toBe(false);
      expect(money?.valueLabel).toBe(expected[s.id]!.valueLabel);
      expect(decideConfidenceAction(extraction.valueConfidencePercent ?? extraction.confidencePercent)).toBe("AUTO_APPLY");
    });
  }
});

describe("golden dataset — DEADLINE scenarios", () => {
  const expectedDates: Record<string, string> = {
    "dl-01": "2026-09-20",
    "dl-02": "2026-08-28", // next Friday from Monday 2026-08-24
    "dl-03": "2026-09-15",
    "dl-04": "2026-08-25", // tomorrow
    "dl-05": "2026-08-30",
  };

  for (const s of DEADLINE_SCENARIOS) {
    it(`${s.id}: normalizes to ${expectedDates[s.id]}`, () => {
      const deadline = parseDeadline(`${s.subject}\n${s.bodyText}`, new Date(s.sentAt));
      expect(deadline).not.toBeNull();
      expect(deadline!.normalizedDate).toBe(expectedDates[s.id]);
      expect(deadline!.confidencePercent).toBeGreaterThanOrEqual(85);
    });
  }
});

describe("golden dataset — RISK scenarios never assert risk as fact", () => {
  for (const s of RISK_SCENARIOS) {
    it(`${s.id}: detects at least one risk phrase, always phrased as "Potential risk detected"`, () => {
      const risks = detectRiskSignals(`${s.subject}\n${s.bodyText}`);
      expect(risks.length).toBeGreaterThan(0);
      for (const r of risks) expect(r).toMatch(/^Potential risk detected:/);
    });
  }
});

describe("golden dataset — OPPORTUNITY scenarios never resolve to an existing deal", () => {
  for (const s of OPPORTUNITY_SCENARIOS) {
    it(`${s.id}: opportunitySignal is set and matchDeal returns POTENTIAL_OPPORTUNITY, never EXISTING_DEAL`, async () => {
      const opportunityText = detectOpportunitySignal(`${s.subject}\n${s.bodyText}`);
      expect(opportunityText).not.toBeNull();

      const extraction = await provider.extractEntities(toEmailInput(s), { organizationId: "org-test", candidateDeals: [] });
      expect(extraction.opportunitySignal).toBe(true);

      const match = await provider.matchDeal(extraction, []);
      expect(match.matchType).toBe("POTENTIAL_OPPORTUNITY");
      expect(match.matchType).not.toBe("EXISTING_DEAL");
    });
  }
});

describe("golden dataset — IRRELEVANT scenarios classify NOT_RELEVANT with no context", () => {
  for (const s of IRRELEVANT_SCENARIOS) {
    it(`${s.id}: "${s.subject}"`, async () => {
      const result = await provider.classifyRelevance(toEmailInput(s), NO_CONTEXT);
      expect(result.relevance).toBe("NOT_RELEVANT");
    });
  }
});

describe("golden dataset — AMBIGUOUS scenarios: classification genuinely depends on context", () => {
  it("am-01: a single weak term is only POSSIBLY_RELEVANT alone, IB_RELEVANT once thread+client context is strong", async () => {
    const scenario = { emailId: "am-01", fromAddress: "x@example.com", toAddresses: [], ccAddresses: [], subject: "Let's discuss", bodyText: "Let's discuss the deal with Acme Industries sometime this week.", sentAt: "2026-08-24T10:00:00.000Z" };

    const weak = await provider.classifyRelevance(scenario, NO_CONTEXT);
    expect(weak.relevance).toBe("POSSIBLY_RELEVANT");

    const strong = await provider.classifyRelevance(scenario, {
      ...NO_CONTEXT,
      threadAlreadyLinkedToDeal: true,
      knownClientNames: ["Acme Industries"],
      priorRelevantEmailsInThread: 1,
    });
    expect(strong.relevance).toBe("IB_RELEVANT");
  });

  it("am-02: a training-session email mentioning valuation is never IB_RELEVANT on content alone", async () => {
    const scenario = { emailId: "am-02", fromAddress: "x@example.com", toAddresses: [], ccAddresses: [], subject: "Training", bodyText: "Don't forget the internal valuation training session Thursday at 10am.", sentAt: "2026-08-24T10:00:00.000Z" };
    const result = await provider.classifyRelevance(scenario, NO_CONTEXT);
    expect(result.relevance).not.toBe("IB_RELEVANT");
  });

  it("am-03: vague sentiment with zero signal and zero context is confidently NOT_RELEVANT", async () => {
    const scenario = { emailId: "am-03", fromAddress: "x@example.com", toAddresses: [], ccAddresses: [], subject: "Discussion", bodyText: "Good discussion today — sounds like real progress.", sentAt: "2026-08-24T10:00:00.000Z" };
    const result = await provider.classifyRelevance(scenario, NO_CONTEXT);
    expect(result.relevance).toBe("NOT_RELEVANT");
    expect(result.confidencePercent).toBeGreaterThanOrEqual(85);
  });

  it("am-04: zero banking terms, but a strong deal/client context alone can still surface it — context can substitute for content", async () => {
    const scenario = { emailId: "am-04", fromAddress: "x@example.com", toAddresses: [], ccAddresses: [], subject: "Following up", bodyText: "Following up — happy to reconnect with Acme Industries whenever works for you.", sentAt: "2026-08-24T10:00:00.000Z" };

    const noContext = await provider.classifyRelevance(scenario, NO_CONTEXT);
    expect(noContext.relevance).toBe("NOT_RELEVANT");

    const strongContext = await provider.classifyRelevance(scenario, {
      ...NO_CONTEXT,
      threadAlreadyLinkedToDeal: true,
      knownClientNames: ["Acme Industries"],
    });
    expect(strongContext.relevance).toBe("IB_RELEVANT");
  });

  it("am-05: a real deadline-shaped phrase never gets a fabricated date", () => {
    const deadline = parseDeadline("Let's plan to close before the IC meeting.", new Date("2026-08-24T10:00:00.000Z"));
    expect(deadline).not.toBeNull();
    expect(deadline!.normalizedDate).toBeNull();
  });
});

describe("golden test — signature/disclaimer non-interpretation", () => {
  it("a stale quoted deal value inside an Outlook-style forward header is stripped before extraction sees it", async () => {
    const bodyWithForward =
      "Confirmed — enterprise value is $500M as discussed.\n" +
      "\n" +
      "From: Old Sender\n" +
      "Sent: last week\n" +
      "To: Someone Else\n" +
      "Subject: Re: valuation\n" +
      "\n" +
      "Just a heads up, the earlier number floated was enterprise value $50M — please disregard.";

    const cleaned = normalizeBody(bodyWithForward);
    expect(cleaned).toContain("$500M");
    expect(cleaned).not.toContain("$50M");
    expect(cleaned).not.toContain("last week");

    const extraction = await provider.extractEntities(
      { emailId: "test-forward", fromAddress: "contact@example.com", toAddresses: [], ccAddresses: [], subject: "Re: valuation", bodyText: cleaned, sentAt: "2026-08-24T10:00:00.000Z" },
      { organizationId: "org-test", candidateDeals: [] },
    );
    expect(extraction.enterpriseValue?.amountMinorUnits).toBe(500_000_000_00);
  });

  it("appending a standard confidentiality footer does not change the extracted deal facts", async () => {
    const footer =
      "\n\nThis email and any attachments are confidential and intended solely for the addressee. " +
      "If you are not the intended recipient, please notify the sender and delete this message. " +
      "Please consider the environment before printing this email.";

    const base = "The buyer would like to proceed to management meetings the week of September 2nd.";
    const withFooter = base + footer;

    const [plain, withFooterResult] = await Promise.all([
      provider.extractEntities({ emailId: "a", fromAddress: "x@example.com", toAddresses: [], ccAddresses: [], subject: "Stage update", bodyText: base, sentAt: "2026-08-24T10:00:00.000Z" }, { organizationId: "org-test", candidateDeals: [] }),
      provider.extractEntities({ emailId: "b", fromAddress: "x@example.com", toAddresses: [], ccAddresses: [], subject: "Stage update", bodyText: withFooter, sentAt: "2026-08-24T10:00:00.000Z" }, { organizationId: "org-test", candidateDeals: [] }),
    ]);

    expect(withFooterResult.stageKey).toBe(plain.stageKey);
    expect(withFooterResult.stageKey).toBe("management_meetings");
  });
});

describe("golden test — false positive: unrelated market commentary never resolves to an existing deal", () => {
  it("a dollar figure in unrelated market commentary, with no deal/client anchor, matches no deal", async () => {
    const scenario = {
      emailId: "test-market-commentary",
      fromAddress: "newsletter@marketwatch.example",
      toAddresses: ["bharath.vijay@tattava-demo.bank"],
      ccAddresses: [],
      subject: "Market wrap",
      bodyText: "The S&P 500 rallied today, adding over $500 billion in market value across the index amid renewed investor optimism.",
      sentAt: "2026-08-24T10:00:00.000Z",
    };

    const extraction = await provider.extractEntities(scenario, { organizationId: "org-test", candidateDeals: [] });
    // detectMoneySignal has no concept of "whose deal" a dollar figure belongs
    // to — the real protection is downstream: with no project codename and
    // no known client named, matchDeal can never resolve EXISTING_DEAL, so
    // this figure is never applied to any real deal's valuation.
    const match = await provider.matchDeal(extraction, []);
    expect(match.matchType).not.toBe("EXISTING_DEAL");
  });
});
