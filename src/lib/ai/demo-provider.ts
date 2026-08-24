import type {
  AIProvider,
  DealCandidate,
  DealMatchResult,
  EmailInput,
  ExtractionResult,
  RelevanceResult,
} from "./types";

// DemoExtractionProvider — a genuine (if intentionally simple) rule-based
// implementation of AIProvider, used by prisma/seed.ts to generate the
// confidence_score / source / extraction_type / review_status records the
// Intelligence Feed needs (AI_EXTRACTION_SPEC.md §7-8), without calling an
// external LLM. It proves the AIProvider abstraction is swappable: the same
// seed data shape is what AnthropicProvider/OpenAIProvider would produce
// once wired to a real model (ARCHITECTURE.md §3).

const RELEVANT_TERMS = [
  "deal",
  "acquisition",
  "merger",
  "management meeting",
  "due diligence",
  "valuation",
  "mandate",
  "term sheet",
  "bid",
  "financing",
  "refinanc",
  "ipo",
  "bookbuild",
  "prospectus",
  "consent",
  "lender",
  "buyer",
  "investor",
  "nda",
  "teaser",
];

const RISK_TERMS = ["no response", "delay", "concern", "risk", "escalat", "have not", "hasn't", "silent"];
const OPPORTUNITY_TERMS = [
  "strategic alternatives",
  "considering a sale",
  "evaluating financing",
  "interested in acquiring",
  "looking for financing",
  "capital raise",
  "potential transaction",
  "expansion",
];

const DOLLAR_PATTERN = /\$([\d,.]+)\s*(bn|billion|m|million)?/i;

function scoreTermHits(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((count, term) => (lower.includes(term) ? count + 1 : count), 0);
}

export class DemoExtractionProvider implements AIProvider {
  async classifyRelevance(email: EmailInput): Promise<RelevanceResult> {
    const text = `${email.subject} ${email.bodyText}`;
    const hits = scoreTermHits(text, RELEVANT_TERMS);
    if (hits >= 2) {
      return {
        relevance: "IB_RELEVANT",
        relevanceScore: Math.min(0.99, 0.75 + hits * 0.05),
        reasons: [`Matched ${hits} investment-banking terms`],
      };
    }
    if (hits === 1) {
      return {
        relevance: "POSSIBLY_RELEVANT",
        relevanceScore: 0.55,
        reasons: ["Matched a single banking-adjacent term"],
      };
    }
    return {
      relevance: "NOT_RELEVANT",
      relevanceScore: 0.1,
      reasons: ["No banking terminology detected"],
    };
  }

  async extractEntities(email: EmailInput): Promise<ExtractionResult> {
    const text = `${email.subject} ${email.bodyText}`;
    const dollarMatch = text.match(DOLLAR_PATTERN);
    const riskHits = scoreTermHits(text, RISK_TERMS);
    const opportunityHits = scoreTermHits(text, OPPORTUNITY_TERMS);
    const relevantHits = scoreTermHits(text, RELEVANT_TERMS);

    const confidencePercent = Math.min(97, 60 + relevantHits * 6 + (dollarMatch ? 8 : 0));

    return {
      enterpriseValue: dollarMatch
        ? {
            amountMinorUnits: parseDollarToMinorUnits(dollarMatch[1], dollarMatch[2]),
            currency: "USD",
          }
        : undefined,
      riskSignal: riskHits > 0 ? "Potential follow-up risk detected in correspondence" : undefined,
      opportunitySignal:
        opportunityHits > 0 ? "Potential origination signal detected in correspondence" : undefined,
      confidencePercent,
      evidence: {
        quotedExcerpt: email.bodyText.slice(0, 220),
        senderName: email.fromName ?? email.fromAddress,
        sentAt: email.sentAt,
      },
    };
  }

  async matchDeal(
    extraction: ExtractionResult,
    candidates: DealCandidate[],
  ): Promise<DealMatchResult> {
    const codename = extraction.projectCodename?.toLowerCase();
    const client = extraction.clientName?.toLowerCase();

    const match = candidates.find(
      (c) =>
        (codename && c.projectCodename.toLowerCase().includes(codename)) ||
        (client && c.clientName.toLowerCase().includes(client)),
    );

    if (match) {
      return { matchType: "EXISTING_DEAL", dealId: match.dealId, confidencePercent: 92 };
    }
    if (extraction.opportunitySignal) {
      return { matchType: "POTENTIAL_OPPORTUNITY", confidencePercent: 78 };
    }
    return { matchType: "UNKNOWN", confidencePercent: 40 };
  }
}

function parseDollarToMinorUnits(amountStr: string, unit?: string): number {
  const amount = Number.parseFloat(amountStr.replace(/,/g, ""));
  const multiplier = /b/i.test(unit ?? "") ? 1_000_000_000 : 1_000_000;
  return Math.round(amount * multiplier * 100);
}
