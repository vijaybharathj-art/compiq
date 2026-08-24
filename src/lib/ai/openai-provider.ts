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

// PLANNED INTEGRATION — OpenAI implementation of AIProvider. Requires
// OPENAI_API_KEY (see .env.example). Not wired into Demo Mode — see
// anthropic-provider.ts for the equivalent notes; this class exists so the
// AI_PROVIDER env var has a real alternative rather than a single
// hard-coded vendor (AI_EXTRACTION_SPEC.md §10, PRODUCT_SPEC.md §27).

export class OpenAIProvider implements AIProvider {
  async classifyRelevance(email: EmailInput, context: ClassificationContext): Promise<RelevanceResult> {
    throw new Error(
      `OpenAIProvider.classifyRelevance is a planned integration (subject="${email.subject}", ` +
        `threadLinked=${context.threadAlreadyLinkedToDeal}). No live OPENAI_API_KEY is configured in this environment.`,
    );
  }

  async extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult> {
    throw new Error(
      `OpenAIProvider.extractEntities is a planned integration (subject="${email.subject}", org=${context.organizationId}).`,
    );
  }

  async matchDeal(
    extraction: ExtractionResult,
    candidates: DealCandidate[],
  ): Promise<DealMatchResult> {
    throw new Error(
      `OpenAIProvider.matchDeal is a planned integration (${candidates.length} candidate deals, extraction confidence=${extraction.confidencePercent}%).`,
    );
  }
}
