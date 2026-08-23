// AIProvider abstraction — see AI_EXTRACTION_SPEC.md §10 and
// ARCHITECTURE.md §3. Implementations: AnthropicProvider, OpenAIProvider,
// selected via getAIProvider() reading AI_PROVIDER.

import type { BankingServiceCode, DealParticipantRole, DealType } from "@/types/domain";

export interface EmailInput {
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  sentAt: string;
}

export interface DealContext {
  organizationId: string;
  /** Existing deals for the resolved client, used to avoid duplicate creation. */
  candidateDeals: DealCandidate[];
}

export interface DealCandidate {
  dealId: string;
  projectCodename: string;
  clientName: string;
}

export type RelevanceLabel = "IB_RELEVANT" | "POSSIBLY_RELEVANT" | "NOT_RELEVANT";

export interface RelevanceResult {
  relevance: RelevanceLabel;
  relevanceScore: number; // 0-1
  reasons: string[];
}

export interface ExtractionResult {
  clientName?: string;
  companyName?: string;
  projectCodename?: string;
  dealType?: DealType;
  bankingService?: BankingServiceCode;
  enterpriseValue?: { amountMinorUnits: number; currency: string };
  equityValue?: { amountMinorUnits: number; currency: string };
  stageKey?: string;
  action?: { description: string; dueHint?: string };
  timeline?: string;
  participants?: { name: string; role: DealParticipantRole }[];
  riskSignal?: string;
  opportunitySignal?: string;
  confidencePercent: number;
  evidence: { quotedExcerpt: string; senderName: string; sentAt: string };
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
}

export interface AIProvider {
  classifyRelevance(email: EmailInput): Promise<RelevanceResult>;
  extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult>;
  matchDeal(extraction: ExtractionResult, candidates: DealCandidate[]): Promise<DealMatchResult>;
}
