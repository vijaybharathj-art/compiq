import type {
  AIProvider,
  ClassificationContext,
  DealCandidate,
  DealContext,
  DealMatchResult,
  EmailInput,
  ExtractionResult,
  RelevanceResult,
} from "./types";

// PLANNED INTEGRATION — Anthropic implementation of AIProvider, using the
// Claude Messages API. Requires ANTHROPIC_API_KEY (see .env.example).
// Prompts live in src/lib/ai/prompts/ and are versioned independently of
// this class. Not wired into Demo Mode — the Intelligence Feed there uses
// pre-computed fixture output with the identical shape this provider would
// produce (AI_EXTRACTION_SPEC.md §4), so swapping this in changes no UI code.

export class AnthropicProvider implements AIProvider {
  async classifyRelevance(email: EmailInput, context: ClassificationContext): Promise<RelevanceResult> {
    throw new Error(
      `AnthropicProvider.classifyRelevance is a planned integration (subject="${email.subject}", ` +
        `threadLinked=${context.threadAlreadyLinkedToDeal}). No live ANTHROPIC_API_KEY is configured in this environment.`,
    );
  }

  async extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult> {
    throw new Error(
      `AnthropicProvider.extractEntities is a planned integration (subject="${email.subject}", org=${context.organizationId}).`,
    );
  }

  async matchDeal(
    extraction: ExtractionResult,
    candidates: DealCandidate[],
  ): Promise<DealMatchResult> {
    throw new Error(
      `AnthropicProvider.matchDeal is a planned integration (${candidates.length} candidate deals, extraction confidence=${extraction.confidencePercent}%).`,
    );
  }
}
