// AIProvider abstraction — see AI_EXTRACTION_SPEC.md §10 and
// PHASE3_EMAIL_INTELLIGENCE.md §9-10. Implementations: DemoAIProvider
// (live, rule-based), AnthropicProvider, OpenAIProvider (both planned
// integrations), selected via getAIProvider() reading AI_PROVIDER.
//
// ExtractionResult / RelevanceResult are re-exported from
// extraction-schema.ts (Zod) — that file is the single source of truth for
// the strict, validated shape every provider must produce.

import type { DealParticipantRole } from "@/types/domain";

export type { ExtractionResult, RelevanceResult } from "./extraction-schema";
export { parseExtractionResult, parseRelevanceResult } from "./extraction-schema";
import type { ExtractionResult, RelevanceResult } from "./extraction-schema";

export interface EmailInput {
  emailId: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string;
  sentAt: string;
}

export interface DealCandidate {
  dealId: string;
  projectCodename: string;
  clientName: string;
  companyName?: string;
  bankingService: string;
  currentStageLabel: string;
}

/** Context available to the classifier beyond the raw email text (spec §6). */
export interface ClassificationContext {
  threadAlreadyLinkedToDeal: boolean;
  senderIsKnownContact: boolean;
  senderIsInternalBanker: boolean;
  knownClientNames: string[];
  knownCompanyNames: string[];
  priorRelevantEmailsInThread: number;
}

export interface DealContext {
  organizationId: string;
  /** Existing deals for the resolved client, used to avoid duplicate creation. */
  candidateDeals: DealCandidate[];
}

export type DealMatchType =
  | "EXISTING_DEAL"
  | "NEW_DEAL_EXISTING_CLIENT"
  | "NEW_CLIENT"
  | "POTENTIAL_OPPORTUNITY"
  | "UNKNOWN";

export interface DealMatchResult {
  matchType: DealMatchType;
  dealId?: string;
  clientId?: string;
  confidencePercent: number;
  reason: string;
  promptVersion: string;
}

export interface AIProvider {
  classifyRelevance(email: EmailInput, context: ClassificationContext): Promise<RelevanceResult>;
  extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult>;
  matchDeal(extraction: ExtractionResult, candidates: DealCandidate[]): Promise<DealMatchResult>;
}

// Re-exported so pipeline code can construct participant role literals
// without importing domain types directly.
export type { DealParticipantRole };
