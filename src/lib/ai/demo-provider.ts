import type {
  AIProvider,
  BriefingFacts,
  BriefingNarrativeResult,
  ClassificationContext,
  DealCandidate,
  DealContext,
  DealMatchResult,
  EmailInput,
} from "./types";
import type { ExtractionResult, RelevanceResult } from "./extraction-schema";
import { parseExtractionResult, parseRelevanceResult } from "./extraction-schema";
import { CLASSIFICATION_PROMPT_V1 } from "./prompts/classification";
import { EXTRACTION_PROMPT_V1 } from "./prompts/extraction";
import { DEAL_MATCHING_PROMPT_V1 } from "./prompts/deal-matching";
import { BRIEFING_SUMMARY_PROMPT_V1 } from "./prompts/briefing";
import {
  detectMeetings,
  detectMoneySignal,
  detectOpportunitySignal,
  detectRiskSignals,
  detectStageSignal,
  extractActions,
  extractProjectCodename,
  extractRoleMentions,
  parseDeadline,
} from "./extractors";

// DemoAIProvider — a genuine (if intentionally deterministic) rule-based
// implementation of AIProvider. It proves the abstraction is swappable: a
// real AnthropicProvider/OpenAIProvider would receive the same EmailInput/
// DealContext and must produce output validating against the exact same
// ExtractionResultSchema (src/lib/ai/extraction-schema.ts) — nothing
// downstream (pipeline, UI) knows which provider is behind getAIProvider().
//
// Unlike Phase 1's simpler keyword-hit-count version, this classifier does
// not rely on keywords alone (spec §6): it factors in whether the sender is
// a known contact/internal banker, whether the thread already resolves to
// a deal, and whether known client/company names appear — the same term
// ("valuation") produces a different verdict depending on that context.

const RELEVANT_TERMS = [
  "deal", "acquisition", "merger", "management meeting", "due diligence",
  "valuation", "mandate", "term sheet", "bid", "financing", "refinanc",
  "ipo", "bookbuild", "prospectus", "consent", "lender", "buyer",
  "investor", "nda", "teaser", "enterprise value", "equity value",
  "closing", "signing", "indicative offer",
];

function scoreTermHits(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((count, term) => (lower.includes(term) ? count + 1 : count), 0);
}

export class DemoAIProvider implements AIProvider {
  async classifyRelevance(email: EmailInput, context: ClassificationContext): Promise<RelevanceResult> {
    const text = `${email.subject} ${email.bodyText}`;
    const termHits = scoreTermHits(text, RELEVANT_TERMS);
    const mentionsKnownClientOrCompany = [...context.knownClientNames, ...context.knownCompanyNames].some(
      (name) => text.toLowerCase().includes(name.toLowerCase()),
    );

    // Context score: thread already tied to a deal, or a known
    // client/company is named, or the sender is a recognized counterparty
    // contact — these push an ambiguous keyword hit toward IB_RELEVANT.
    // Their absence is exactly what keeps "valuation" in an unrelated
    // email (internal training, a personal note) from being misclassified.
    // Context can only ever amplify a term signal or, if truly strong on
    // its own (thread already tied to a deal AND a known client/company is
    // named — contextScore >= 4), substitute for one. It can never turn a
    // zero-content email (an office-wifi notice sent by an internal
    // banker, a thread-linked "thanks!") into something relevant on
    // sender identity alone — that was the bug in the first cut of this
    // classifier: senderIsInternalBanker/senderIsKnownContact by
    // themselves pushed plenty of non-banking mail into POSSIBLY_RELEVANT.
    let contextScore = 0;
    if (context.threadAlreadyLinkedToDeal) contextScore += 2;
    if (mentionsKnownClientOrCompany) contextScore += 2;
    if (context.senderIsKnownContact) contextScore += 1;
    if (context.senderIsInternalBanker) contextScore += 1;
    if (context.priorRelevantEmailsInThread > 0) contextScore += 1;

    const reasonParts: string[] = [];
    if (termHits > 0) reasonParts.push(`${termHits} banking term${termHits === 1 ? "" : "s"}`);
    if (context.threadAlreadyLinkedToDeal) reasonParts.push("thread already linked to a known deal");
    if (mentionsKnownClientOrCompany) reasonParts.push("names a known client or company");
    if (context.senderIsKnownContact) reasonParts.push("sender is a known deal contact");
    if (context.senderIsInternalBanker) reasonParts.push("sender is an internal banker");

    const strongContentSignal = termHits >= 2;
    const contentPlusContext = termHits >= 1 && contextScore >= 2;
    const contextOnlySignal = termHits === 0 && contextScore >= 4;

    if (strongContentSignal || contentPlusContext || contextOnlySignal) {
      const score = termHits * 3 + contextScore;
      return parseRelevanceResult({
        relevance: "IB_RELEVANT",
        confidencePercent: Math.min(98, 76 + score * 3),
        reason: reasonParts.length > 0 ? reasonParts.join("; ") : "Multiple banking signals present",
        promptVersion: CLASSIFICATION_PROMPT_V1,
      });
    }

    const weakContentSignal = termHits >= 1;
    const weakContextPair = termHits === 0 && contextScore >= 2;

    if (weakContentSignal || weakContextPair) {
      return parseRelevanceResult({
        relevance: "POSSIBLY_RELEVANT",
        confidencePercent: 50 + (termHits * 8 + contextScore * 4),
        reason:
          reasonParts.length > 0
            ? `Weak signal only: ${reasonParts.join("; ")}`
            : "Banking-adjacent term with no deal/client anchor",
        promptVersion: CLASSIFICATION_PROMPT_V1,
      });
    }

    return parseRelevanceResult({
      relevance: "NOT_RELEVANT",
      confidencePercent: 90,
      reason: "No banking terminology and no meaningful contextual link to a known client, company, or deal",
      promptVersion: CLASSIFICATION_PROMPT_V1,
    });
  }

  async extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult> {
    const text = `${email.subject}\n${email.bodyText}`;
    const referenceDate = new Date(email.sentAt);

    const money = detectMoneySignal(text);
    const stageSignal = detectStageSignal(text);
    const deadline = parseDeadline(text, referenceDate);
    const meetings = detectMeetings(text, referenceDate);
    const riskSignals = detectRiskSignals(text);
    const opportunitySignalText = detectOpportunitySignal(text);
    const actions = extractActions(text);
    const codename = extractProjectCodename(text);

    // A management-meeting signal always implies a concrete follow-up
    // action even when the email doesn't phrase it as "we need X" (e.g.
    // "Buyer would like to meet management next week") — this is what lets
    // that kind of email produce both a stage signal and a task.
    if (
      meetings.some((m) => m.type === "MANAGEMENT_MEETING") &&
      !actions.some((a) => /management meeting/i.test(a))
    ) {
      actions.push("Schedule management meeting");
    }

    const matchedCandidate = codename
      ? context.candidateDeals.find((d) => d.projectCodename.toLowerCase() === codename.toLowerCase())
      : undefined;

    const signalCount =
      (money ? 1 : 0) + (stageSignal ? 1 : 0) + (deadline ? 1 : 0) + meetings.length + riskSignals.length +
      (opportunitySignalText ? 1 : 0) + actions.length;

    const baseConfidence = money?.hedged
      ? money.confidencePercent
      : Math.min(97, 60 + signalCount * 6 + (matchedCandidate ? 10 : 0));

    const moneyField = money
      ? { amountMinorUnits: money.amountMinorUnits, currency: money.currency }
      : undefined;

    return parseExtractionResult({
      clientName: matchedCandidate?.clientName ?? null,
      companyName: matchedCandidate?.companyName ?? null,
      dealName: codename,
      bankingService: matchedCandidate?.bankingService ?? null,
      dealType: null,
      dealValue: money?.valueLabel === "deal" ? moneyField : null,
      enterpriseValue: !money || money.valueLabel === "enterprise" ? moneyField ?? null : null,
      equityValue: money?.valueLabel === "equity" ? moneyField : null,
      stageKey: stageSignal?.stageKey ?? null,
      buyers: extractRoleMentions(text, "buyer"),
      sellers: extractRoleMentions(text, "seller"),
      investors: extractRoleMentions(text, "investor"),
      lenders: extractRoleMentions(text, "lender"),
      advisors: extractRoleMentions(text, "advisor"),
      lawyers: extractRoleMentions(text, "lawyer"),
      accountants: extractRoleMentions(text, "accountant"),
      leadBanker: null,
      dealTeamMembers: [],
      deadline: deadline
        ? {
            originalText: deadline.originalText,
            normalizedDate: deadline.normalizedDate,
            confidencePercent: deadline.confidencePercent,
          }
        : null,
      meetings,
      actions,
      transactionStatus: null,
      riskSignals,
      opportunitySignal: Boolean(opportunitySignalText),
      opportunitySignalText,
      confidencePercent: Math.round(baseConfidence),
      stageConfidencePercent: stageSignal?.confidencePercent ?? null,
      valueConfidencePercent: money?.confidencePercent ?? null,
      promptVersion: EXTRACTION_PROMPT_V1,
      evidence: {
        quotedExcerpt: email.bodyText.slice(0, 280),
        senderName: email.fromName ?? email.fromAddress,
        sentAt: email.sentAt,
      },
    });
  }

  async matchDeal(extraction: ExtractionResult, candidates: DealCandidate[]): Promise<DealMatchResult> {
    const codename = extraction.dealName?.toLowerCase();
    const client = extraction.clientName?.toLowerCase();

    const exactCodenameMatch = codename
      ? candidates.find((c) => c.projectCodename.toLowerCase() === codename)
      : undefined;
    if (exactCodenameMatch) {
      return {
        matchType: "EXISTING_DEAL",
        dealId: exactCodenameMatch.dealId,
        confidencePercent: 97,
        reason: `Exact project codename match ("${exactCodenameMatch.projectCodename}")`,
        promptVersion: DEAL_MATCHING_PROMPT_V1,
      };
    }

    const clientMatch = client ? candidates.find((c) => c.clientName.toLowerCase() === client) : undefined;
    if (clientMatch) {
      return {
        matchType: "EXISTING_DEAL",
        dealId: clientMatch.dealId,
        confidencePercent: 84,
        reason: `Client name match with no conflicting codename ("${clientMatch.clientName}")`,
        promptVersion: DEAL_MATCHING_PROMPT_V1,
      };
    }

    if (extraction.opportunitySignal) {
      return {
        matchType: "POTENTIAL_OPPORTUNITY",
        confidencePercent: 78,
        reason: "Email describes a possible future transaction, not a confirmed mandate",
        promptVersion: DEAL_MATCHING_PROMPT_V1,
      };
    }

    if (extraction.clientName) {
      return {
        matchType: "NEW_DEAL_EXISTING_CLIENT",
        confidencePercent: 55,
        reason: "Known client named, but no existing deal or opportunity signal matched",
        promptVersion: DEAL_MATCHING_PROMPT_V1,
      };
    }

    return {
      matchType: "UNKNOWN",
      confidencePercent: 35,
      reason: "Insufficient signal to resolve a client or deal",
      promptVersion: DEAL_MATCHING_PROMPT_V1,
    };
  }

  // Deliberately a template over the structured facts, not a generative
  // call — every sentence is assembled from fields already in
  // BriefingFacts, so there is zero opportunity to invent a number or a
  // development the database doesn't contain (spec §44-45). A real
  // AnthropicProvider/OpenAIProvider would receive the identical
  // BriefingFacts object under BRIEFING_SUMMARY_SYSTEM_PROMPT and must
  // honor the same "never invent, never recompute" constraint.
  async summarizeBriefing(facts: BriefingFacts): Promise<BriefingNarrativeResult> {
    const sentences: string[] = [];

    sentences.push(
      `${facts.summary.dealsChanged} deal${facts.summary.dealsChanged === 1 ? "" : "s"} changed since your last briefing` +
        (facts.summary.dealsAdvanced > 0 ? `, with ${facts.summary.dealsAdvanced} advancing` : "") +
        ".",
    );

    if (facts.priorities.length > 0) {
      sentences.push(`Top priority: ${facts.priorities[0]!.headline}`);
    }

    if (facts.risks.length > 0) {
      sentences.push(
        `${facts.risks.length} potential risk${facts.risks.length === 1 ? "" : "s"} detected` +
          (facts.risks[0]?.dealCodename ? `, including ${facts.risks[0]!.dealCodename}` : "") +
          ".",
      );
    }

    if (facts.opportunities.length > 0) {
      sentences.push(
        `${facts.opportunities.length} new opportunity signal${facts.opportunities.length === 1 ? "" : "s"} detected.`,
      );
    }

    return { narrative: sentences.join(" "), promptVersion: BRIEFING_SUMMARY_PROMPT_V1 };
  }
}
