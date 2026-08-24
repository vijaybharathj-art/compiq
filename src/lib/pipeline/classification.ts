import type { PrismaClient } from "@/generated/prisma/client";
import type { AIProvider, ClassificationContext, EmailInput } from "@/lib/ai/types";
import type { RelevanceResult } from "@/lib/ai/extraction-schema";

// Relevance classification stage (spec §5-6). Builds context from the
// database — thread linkage, known contact/banker status, and whether the
// org actually covers the named client/company — so the same keyword
// ("valuation") is judged differently depending on that context, not
// classified by keyword alone.

export interface ClassificationInput {
  emailId: string;
  threadId: string;
  fromAddress: string;
}

export async function buildClassificationContext(
  db: PrismaClient,
  input: ClassificationInput,
  knownClientNames: string[],
  knownCompanyNames: string[],
): Promise<ClassificationContext> {
  const [thread, contact, banker, priorRelevantCount] = await Promise.all([
    db.emailThread.findUnique({ where: { id: input.threadId }, select: { dealId: true } }),
    db.contact.findFirst({ where: { email: input.fromAddress } }),
    db.user.findUnique({ where: { email: input.fromAddress } }),
    db.email.count({
      where: { threadId: input.threadId, id: { not: input.emailId }, relevance: "IB_RELEVANT" },
    }),
  ]);

  return {
    threadAlreadyLinkedToDeal: Boolean(thread?.dealId),
    senderIsKnownContact: Boolean(contact),
    senderIsInternalBanker: Boolean(banker),
    knownClientNames,
    knownCompanyNames,
    priorRelevantEmailsInThread: priorRelevantCount,
  };
}

export async function classifyEmail(
  db: PrismaClient,
  aiProvider: AIProvider,
  emailInput: EmailInput,
  context: ClassificationContext,
): Promise<RelevanceResult> {
  const result = await aiProvider.classifyRelevance(emailInput, context);

  await db.$transaction([
    db.email.update({
      where: { id: emailInput.emailId },
      data: { relevance: result.relevance, relevanceScore: result.confidencePercent / 100 },
    }),
    db.emailClassification.upsert({
      where: { emailId: emailInput.emailId },
      create: {
        emailId: emailInput.emailId,
        label: result.relevance,
        confidence: result.confidencePercent / 100,
        reason: result.reason,
        promptVersion: result.promptVersion,
      },
      update: {
        label: result.relevance,
        confidence: result.confidencePercent / 100,
        reason: result.reason,
        promptVersion: result.promptVersion,
      },
    }),
  ]);

  return result;
}
