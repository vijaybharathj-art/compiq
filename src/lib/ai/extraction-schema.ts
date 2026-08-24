import { z } from "zod";

// Strict, versioned schema for AIProvider.extractEntities() output
// (spec §7/§8). Every AIProvider implementation — demo or a real LLM —
// must produce output that parses against this schema; the pipeline's
// extraction stage (src/lib/pipeline/extraction.ts) calls
// ExtractionResultSchema.parse() before anything is written to the
// database. "Never trust raw LLM output directly."

const MoneySchema = z.object({
  amountMinorUnits: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

const DeadlineSchema = z.object({
  originalText: z.string().min(1),
  normalizedDate: z.string().date().nullable(),
  confidencePercent: z.number().min(0).max(100),
});

const MeetingSchema = z.object({
  type: z.enum([
    "MANAGEMENT_MEETING",
    "BUYER_MEETING",
    "INVESTOR_MEETING",
    "IC_MEETING",
    "DUE_DILIGENCE_MEETING",
    "KICK_OFF",
    "CLOSING_MEETING",
    "OTHER",
  ]),
  originalText: z.string().min(1),
  normalizedDate: z.string().date().nullable(),
});

export const EvidenceSchema = z.object({
  quotedExcerpt: z.string().min(1).max(500),
  senderName: z.string(),
  sentAt: z.string(),
});

export const ExtractionResultSchema = z.object({
  clientName: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  dealName: z.string().nullable().optional(),
  bankingService: z.string().nullable().optional(),
  dealType: z.string().nullable().optional(),
  dealValue: MoneySchema.nullable().optional(),
  enterpriseValue: MoneySchema.nullable().optional(),
  equityValue: MoneySchema.nullable().optional(),
  stageKey: z.string().nullable().optional(),
  buyers: z.array(z.string()).default([]),
  sellers: z.array(z.string()).default([]),
  investors: z.array(z.string()).default([]),
  lenders: z.array(z.string()).default([]),
  advisors: z.array(z.string()).default([]),
  lawyers: z.array(z.string()).default([]),
  accountants: z.array(z.string()).default([]),
  leadBanker: z.string().nullable().optional(),
  dealTeamMembers: z.array(z.string()).default([]),
  deadline: DeadlineSchema.nullable().optional(),
  meetings: z.array(MeetingSchema).default([]),
  actions: z.array(z.string()).default([]),
  transactionStatus: z.string().nullable().optional(),
  riskSignals: z.array(z.string()).default([]),
  opportunitySignal: z.boolean().default(false),
  opportunitySignalText: z.string().nullable().optional(),
  confidencePercent: z.number().min(0).max(100),
  /** Per-field confidence, when the provider can distinguish it (falls back to confidencePercent otherwise). */
  stageConfidencePercent: z.number().min(0).max(100).nullable().optional(),
  valueConfidencePercent: z.number().min(0).max(100).nullable().optional(),
  promptVersion: z.string(),
  evidence: EvidenceSchema,
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const RelevanceResultSchema = z.object({
  relevance: z.enum(["IB_RELEVANT", "POSSIBLY_RELEVANT", "NOT_RELEVANT"]),
  confidencePercent: z.number().min(0).max(100),
  reason: z.string().min(1),
  promptVersion: z.string(),
});

export type RelevanceResult = z.infer<typeof RelevanceResultSchema>;

/** Validates raw provider output; throws a descriptive error on shape drift. */
export function parseExtractionResult(raw: unknown): ExtractionResult {
  return ExtractionResultSchema.parse(raw);
}

export function parseRelevanceResult(raw: unknown): RelevanceResult {
  return RelevanceResultSchema.parse(raw);
}
