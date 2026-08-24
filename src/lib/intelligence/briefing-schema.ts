import { z } from "zod";

// Strict validation for generated briefings (spec §11: "Validate the
// output.") — mirrors the pattern in src/lib/ai/extraction-schema.ts.
// Applied to the assembled BriefingContent before it's written to the
// Briefing.content JSON column, so a malformed briefing never reaches the
// database silently.

export const BriefingPrioritySchema = z.object({
  headline: z.string().min(1),
  reason: z.string().min(1),
  dealId: z.string().optional(),
  dealCodename: z.string().optional(),
  sourceEventId: z.string().optional(),
});

export const BriefingContentSchema = z.object({
  narrative: z.string(),
  priorities: z.array(BriefingPrioritySchema),
  dealAdvancements: z.array(
    z.object({
      dealId: z.string(),
      dealCodename: z.string(),
      previousStage: z.string(),
      newStage: z.string(),
      sourceEventId: z.string().optional(),
    }),
  ),
  risks: z.array(
    z.object({
      riskId: z.string().optional(),
      dealId: z.string().optional(),
      dealCodename: z.string().optional(),
      description: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      sourceEventId: z.string().optional(),
    }),
  ),
  deadlines: z.array(
    z.object({
      taskId: z.string(),
      title: z.string(),
      dealId: z.string().optional(),
      dealCodename: z.string().optional(),
      dueLabel: z.string(),
      urgency: z.enum(["CRITICAL", "HIGH", "ATTENTION", "NORMAL"]),
    }),
  ),
  opportunities: z.array(
    z.object({
      clientId: z.string(),
      clientName: z.string(),
      signalText: z.string(),
      sourceEventId: z.string().optional(),
    }),
  ),
  recommendedActions: z.array(
    z.object({
      headline: z.string(),
      reason: z.string(),
      dealId: z.string().optional(),
      dealCodename: z.string().optional(),
      sourceEventId: z.string().optional(),
    }),
  ),
});

export const BriefingSummarySchema = z.object({
  dealsChanged: z.number().int().min(0),
  dealsAdvanced: z.number().int().min(0),
  risks: z.number().int().min(0),
  opportunities: z.number().int().min(0),
  tasksCreated: z.number().int().min(0),
});

export type BriefingContent = z.infer<typeof BriefingContentSchema>;
export type BriefingSummary = z.infer<typeof BriefingSummarySchema>;

export function parseBriefingContent(input: unknown): BriefingContent {
  return BriefingContentSchema.parse(input);
}

export function parseBriefingSummary(input: unknown): BriefingSummary {
  return BriefingSummarySchema.parse(input);
}
