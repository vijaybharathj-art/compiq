import { getPrismaClient } from "@/lib/db";

// Read models for the Phase 3 UI (AI Review Center, Scan Status, Email
// Activity, dashboard "Since Your Last Scan"). Pipeline-internal — unlike
// src/lib/data/, these aren't part of the swappable demo/live repository
// surface, just direct Prisma reads the new pages use.

const db = getPrismaClient();

export interface PendingSuggestion {
  id: string;
  dealId: string | null;
  dealCodename: string | null;
  clientName: string | null;
  changeType: string;
  previousValue?: string;
  newValue?: string;
  confidencePercent: number;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  emailReceivedAt: string;
  evidenceExcerpt: string | null;
  createdAt: string;
}

export async function getPendingSuggestions(organizationId: string): Promise<PendingSuggestion[]> {
  const rows = await db.aiExtraction.findMany({
    // processingJobId is only ever set by the live pipeline
    // (src/lib/pipeline/suggestions.ts) — this excludes the older,
    // differently-shaped SUGGESTED_PENDING rows prisma/seed.ts backfills
    // for narrative history, which don't carry a changeType/
    // previousValue/newValue an Accept action could actually apply.
    where: { appliedStatus: "SUGGESTED_PENDING", processingJobId: { not: null }, deal: { organizationId } },
    include: { deal: { include: { client: true } }, email: true, evidence: true },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => {
    const fields = r.extractedFields as { changeType?: string; previousValue?: string; newValue?: string };
    return {
      id: r.id,
      dealId: r.dealId,
      dealCodename: r.deal?.projectCodename ?? null,
      clientName: r.deal?.client.name ?? null,
      changeType: fields.changeType ?? "UNKNOWN",
      previousValue: fields.previousValue,
      newValue: fields.newValue,
      confidencePercent: r.confidencePercent,
      emailId: r.emailId,
      emailSubject: r.email.subject,
      emailFrom: r.email.fromName ?? r.email.fromAddress,
      emailReceivedAt: r.email.receivedAt.toISOString(),
      evidenceExcerpt: r.evidence[0]?.quotedExcerpt ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export interface JobSummary {
  id: string;
  displayId: string;
  status: string;
  stage: string | null;
  totalEmails: number;
  processedCount: number;
  relevantCount: number;
  dealsUpdated: number;
  tasksCreated: number;
  opportunitiesCreated: number;
  risksDetected: number;
  suggestionsForReview: number;
  errorMessage: string | null;
  triggeredByName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export async function getRecentJobs(organizationId: string, limit = 10): Promise<JobSummary[]> {
  const rows = await db.emailProcessingJob.findMany({
    where: { organizationId },
    include: { triggeredBy: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    displayId: r.displayId,
    status: r.status,
    stage: r.stage,
    totalEmails: r.totalEmails,
    processedCount: r.processedCount,
    relevantCount: r.relevantCount,
    dealsUpdated: r.dealsUpdated,
    tasksCreated: r.tasksCreated,
    opportunitiesCreated: r.opportunitiesCreated,
    risksDetected: r.risksDetected,
    suggestionsForReview: r.suggestionsForReview,
    errorMessage: r.errorMessage,
    triggeredByName: r.triggeredBy?.name ?? null,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getPendingEmailCount(organizationId: string): Promise<number> {
  const account = await db.emailAccount.findFirst({ where: { organizationId } });
  if (!account) return 0;
  return db.email.count({ where: { thread: { emailAccountId: account.id }, processingStatus: "PENDING" } });
}

export interface ProcessedEmailSummary {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedAt: string;
  relevance: string;
  relevanceScore: number | null;
  processingStatus: string;
  processingError: string | null;
  dealCodename: string | null;
  classificationReason: string | null;
}

export async function getRecentlyProcessedEmails(
  organizationId: string,
  limit = 30,
): Promise<ProcessedEmailSummary[]> {
  const rows = await db.email.findMany({
    where: {
      thread: { emailAccount: { organizationId } },
      processingStatus: { in: ["PROCESSED", "PROCESSING_FAILED"] },
    },
    include: { thread: { include: { deal: true } }, classification: true },
    orderBy: { processedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    fromName: r.fromName ?? r.fromAddress,
    fromAddress: r.fromAddress,
    receivedAt: r.receivedAt.toISOString(),
    relevance: r.relevance,
    relevanceScore: r.relevanceScore,
    processingStatus: r.processingStatus,
    processingError: r.processingError,
    dealCodename: r.thread.deal?.projectCodename ?? null,
    classificationReason: r.classification?.reason ?? null,
  }));
}
