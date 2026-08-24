import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db";
import { getEmailProviderFor } from "./index";
import { EmailProviderError } from "./types";
import type { EmailMessage, SyncOptions } from "./types";
import { log, processSingleEmail, setStage } from "@/lib/pipeline/orchestrator";
import { emptyScanCounters, type ScanCounters } from "@/lib/pipeline/types";
import { PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { runInactivityScan } from "@/lib/intelligence/inactivity";
import { runDeadlineScan } from "@/lib/intelligence/deadline";

// The real-mailbox counterpart to orchestrator.ts's runScan() —
// PHASE5_REAL_EMAIL_INTEGRATION.md §15-17, §26, §76-78. Deliberately NOT a
// second pipeline: this file's only new responsibility is "ingestion" —
// turning a freshly fetched, provider-normalized EmailMessage (which has no
// EmailThread/Email row yet) into one, with dedup via the same compound
// unique constraints the schema already defines — after which it hands off
// to the exact same processSingleEmail()/log()/setStage() the Demo Mode
// scan uses. Provider differences end at normalization (spec §35); nothing
// below this point cares whether a message came from Gmail, Graph, or the
// seeded demo mailbox.

// Bounds how many provider pages one invocation fetches — this project has
// no persistent background worker (Vercel-compatible constraint, spec
// §45-46), so "Sync Now" is itself the only unit of work. A bounded loop
// keeps one invocation inside a serverless function's timeout; an account
// with more to fetch than this simply leaves hasMore=true and a persisted
// resumeCursor/syncCursor for the next "Sync Now" click to continue from
// (spec §77).
const MAX_PAGES_PER_INVOCATION = 5;
const DEFAULT_PAGE_SIZE = 25;

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("A sync is already in progress for this mailbox.");
    this.name = "SyncAlreadyRunningError";
  }
}

export interface RunAccountSyncResult {
  jobId: string;
  displayId: string;
  syncType: "INITIAL" | "INCREMENTAL";
  hasMore: boolean;
  counters: ScanCounters;
  messagesFetched: number;
  messagesIngested: number;
  messagesSkipped: number;
  messagesFailed: number;
}

async function nextSyncDisplayId(db: PrismaClient): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const countToday = await db.emailProcessingJob.count({
    where: { displayId: { startsWith: `SYNC-${today}` } },
  });
  return `SYNC-${today}-${String(countToday + 1).padStart(3, "0")}`;
}

function summarizeParticipants(message: EmailMessage): string {
  const names = [message.fromName ?? message.fromAddress, ...message.toAddresses.slice(0, 2)];
  return [...new Set(names)].join(", ");
}

async function upsertThread(db: PrismaClient, accountId: string, message: EmailMessage): Promise<string> {
  const existing = await db.emailThread.findUnique({
    where: { emailAccountId_providerThreadId: { emailAccountId: accountId, providerThreadId: message.providerThreadId } },
  });
  if (existing) {
    if (message.receivedAt > existing.lastMessageAt) {
      await db.emailThread.update({ where: { id: existing.id }, data: { lastMessageAt: message.receivedAt } });
    }
    return existing.id;
  }
  const created = await db.emailThread.create({
    data: {
      emailAccountId: accountId,
      providerThreadId: message.providerThreadId,
      subject: message.subject,
      participantSummary: summarizeParticipants(message),
      lastMessageAt: message.receivedAt,
    },
  });
  return created.id;
}

interface IngestOutcome {
  emailId: string;
  threadId: string;
  isNew: boolean;
}

/**
 * Upserts EmailThread + Email for one freshly fetched message, deduplicating
 * on the schema's own compound unique keys (spec §18 — processing the same
 * message 1/2/5/10 times must yield exactly one Email row). Attachment
 * metadata is persisted (filename/type/size) but content is never
 * downloaded in Phase 5A (spec §20) — storageRef records that explicitly
 * rather than pointing at a real object.
 */
async function ingestMessage(db: PrismaClient, accountId: string, jobId: string, message: EmailMessage): Promise<IngestOutcome> {
  const threadId = await upsertThread(db, accountId, message);

  const existing = await db.email.findUnique({
    where: { threadId_providerMessageId: { threadId, providerMessageId: message.providerMessageId } },
  });
  if (existing) return { emailId: existing.id, threadId, isNew: false };

  const created = await db.email.create({
    data: {
      threadId,
      providerMessageId: message.providerMessageId,
      fromAddress: message.fromAddress,
      fromName: message.fromName,
      toAddresses: message.toAddresses,
      ccAddresses: message.ccAddresses,
      subject: message.subject,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
      processingStatus: "PENDING",
      processingJobId: jobId,
    },
  });

  if (message.attachments.length > 0) {
    await db.emailAttachment.createMany({
      data: message.attachments.map((att) => ({
        emailId: created.id,
        filename: att.filename,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        storageRef: `not-downloaded:${att.id}`,
      })),
    });
  }

  return { emailId: created.id, threadId, isNew: true };
}

/**
 * Runs (or resumes) a sync for one connected mailbox — the "Sync Now"
 * action (spec §26, §76-78). Guarded single-flight via
 * EmailAccount.activeSyncJobId; determines INITIAL vs. INCREMENTAL from
 * EmailAccount.initialSyncCompleted; fetches through the account's
 * EmailProvider; ingests and dedupes each message; hands every genuinely
 * new message to the unmodified Phase 3 processSingleEmail(); then runs the
 * same Phase 4 org-wide passes (inactivity/deadline) runScan() does, since
 * a real "Sync Now" click is the only tick this environment has (no
 * scheduler — spec §46).
 */
export async function runAccountSync(accountId: string, triggeredById?: string): Promise<RunAccountSyncResult> {
  const db = getPrismaClient();

  const account = await db.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error(`No EmailAccount found for id ${accountId}.`);
  if (account.connectionStatus === "DISCONNECTED") {
    throw new Error("This mailbox is disconnected — reconnect before syncing.");
  }

  if (account.activeSyncJobId) {
    const activeJob = await db.emailProcessingJob.findUnique({ where: { id: account.activeSyncJobId } });
    if (activeJob && activeJob.status === "RUNNING") throw new SyncAlreadyRunningError();
  }

  const syncType: "INITIAL" | "INCREMENTAL" = account.initialSyncCompleted ? "INCREMENTAL" : "INITIAL";
  const displayId = await nextSyncDisplayId(db);
  const counters: ScanCounters = emptyScanCounters();

  const job = await db.emailProcessingJob.create({
    data: {
      displayId,
      organizationId: account.organizationId,
      emailAccountId: account.id,
      syncType,
      status: "RUNNING",
      triggeredById,
      stage: PIPELINE_STAGES[0],
      startedAt: new Date(),
    },
  });

  let messagesFetched = 0;
  let messagesFailed = 0;
  let messagesSkipped = 0;
  let hasMoreOverall = false;
  let latestSyncStateCursor: string | undefined = account.syncCursor ?? undefined;

  try {
    await db.emailAccount.update({ where: { id: account.id }, data: { activeSyncJobId: job.id } });

    await log(db, job.id, "ingestion", "info", `${syncType === "INITIAL" ? "Initial" : "Incremental"} sync ${displayId} started for ${account.emailAddress}`);
    await setStage(db, job.id, PIPELINE_STAGES[0]);

    const provider = getEmailProviderFor(account.provider);
    const [clients, companies] = await Promise.all([
      db.client.findMany({ where: { organizationId: account.organizationId }, select: { name: true } }),
      db.company.findMany({ where: { organizationId: account.organizationId }, select: { name: true } }),
    ]);
    const knownClientNames = clients.map((c) => c.name);
    const knownCompanyNames = companies.map((c) => c.name);

    let cursor = syncType === "INCREMENTAL" ? account.syncCursor ?? undefined : undefined;
    const windowDays = account.initialSyncWindowDays;

    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_INVOCATION; pageIndex++) {
      const options: SyncOptions = { cursor, windowDays, pageSize: DEFAULT_PAGE_SIZE };

      let syncPage;
      try {
        syncPage = syncType === "INITIAL" ? await provider.initialSync(account.id, options) : await provider.incrementalSync(account.id, options);
      } catch (err) {
        throw provider.handleProviderError(err);
      }

      messagesFetched += syncPage.messages.length;
      if (syncPage.syncStateCursor) latestSyncStateCursor = syncPage.syncStateCursor;

      await setStage(db, job.id, PIPELINE_STAGES[1]);

      for (const message of syncPage.messages) {
        let ingestOutcome: IngestOutcome;
        try {
          ingestOutcome = await ingestMessage(db, account.id, job.id, message);
        } catch (err) {
          messagesFailed += 1;
          const messageText = err instanceof Error ? err.message : String(err);
          await log(db, job.id, "ingestion", "error", `failed to ingest message ${message.providerMessageId}: ${messageText}`);
          continue;
        }

        if (!ingestOutcome.isNew) {
          messagesSkipped += 1;
          continue;
        }

        try {
          await setStage(db, job.id, PIPELINE_STAGES[2]);
          await db.email.update({ where: { id: ingestOutcome.emailId }, data: { processingStatus: "PROCESSING", processingJobId: job.id } });
          const outcome = await processSingleEmail(
            db,
            account.organizationId,
            job.id,
            ingestOutcome.emailId,
            message,
            ingestOutcome.threadId,
            knownClientNames,
            knownCompanyNames,
            counters,
          );
          counters.processedCount += 1;
          if (outcome.relevant) counters.relevantCount += 1;
        } catch (err) {
          messagesFailed += 1;
          const messageText = err instanceof Error ? err.message : String(err);
          await db.email.update({
            where: { id: ingestOutcome.emailId },
            data: { processingStatus: "PROCESSING_FAILED", processingError: messageText },
          });
          await log(db, job.id, "error", "error", `email ${ingestOutcome.emailId} failed: ${messageText}`, ingestOutcome.emailId);
        }
      }

      await db.emailProcessingJob.update({
        where: { id: job.id },
        data: { messagesFetched, messagesFailed, messagesSkipped, resumeCursor: syncPage.nextCursor ?? null },
      });

      cursor = syncPage.nextCursor;
      hasMoreOverall = syncPage.hasMore;
      if (!syncPage.hasMore) break;
    }

    await setStage(db, job.id, PIPELINE_STAGES[3]);

    // Same Phase 4 org-wide passes runScan() runs at the end of a Demo Mode
    // scan (src/lib/pipeline/orchestrator.ts) — not per-email, so they run
    // once here too rather than duplicated logic. This is the only "tick"
    // available without a scheduler (spec §46), so it runs on every sync,
    // not only when new mail arrived — a deal can go inactive from time
    // passing alone.
    const inactivityResult = await runInactivityScan(account.organizationId);
    await log(db, job.id, "inactivity-scan", "info", `${inactivityResult.createdCount} deal(s) newly flagged inactive`);
    const deadlineResult = await runDeadlineScan(account.organizationId);
    await log(db, job.id, "deadline-scan", "info", `${deadlineResult.escalatedCount} overdue task(s) escalated`);

    await setStage(db, job.id, "Sync complete");

    const now = new Date();
    await db.emailAccount.update({
      where: { id: account.id },
      data: {
        activeSyncJobId: null,
        lastSyncedAt: now,
        lastSuccessfulSyncAt: now,
        connectionError: null,
        connectionStatus: "CONNECTED",
        ...(!hasMoreOverall
          ? {
              syncCursor: latestSyncStateCursor ?? account.syncCursor,
              ...(syncType === "INITIAL" ? { initialSyncCompleted: true } : {}),
            }
          : {}),
      },
    });

    await db.emailProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        stage: "Sync complete",
        finishedAt: new Date(),
        totalEmails: messagesFetched,
        processedCount: counters.processedCount,
        relevantCount: counters.relevantCount,
        dealsUpdated: counters.dealsUpdated,
        tasksCreated: counters.tasksCreated,
        opportunitiesCreated: counters.opportunitiesCreated,
        risksDetected: counters.risksDetected,
        suggestionsForReview: counters.suggestionsForReview,
        messagesFetched,
        messagesFailed,
        messagesSkipped,
      },
    });

    await db.auditLog.create({
      data: {
        organizationId: account.organizationId,
        actorUserId: triggeredById ?? account.userId,
        action: `Email ${syncType === "INITIAL" ? "initial" : "incremental"} sync completed`,
        entityType: "EmailAccount",
        entityId: account.id,
        metadata: {
          displayId,
          syncType,
          messagesFetched,
          messagesSkipped,
          messagesFailed,
          hasMore: hasMoreOverall,
          ...counters,
        },
      },
    });

    return {
      jobId: job.id,
      displayId,
      syncType,
      hasMore: hasMoreOverall,
      counters,
      messagesFetched,
      messagesIngested: counters.processedCount,
      messagesSkipped,
      messagesFailed,
    };
  } catch (err) {
    const providerError = err instanceof EmailProviderError ? err : null;
    const messageText = err instanceof Error ? err.message : String(err);

    await db.emailProcessingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: messageText, finishedAt: new Date(), messagesFetched, messagesFailed, messagesSkipped },
    });
    await log(db, job.id, "orchestrator", "error", `sync failed: ${messageText}`);

    const needsReauth =
      providerError !== null &&
      (providerError.code === "AUTH_EXPIRED" || providerError.code === "AUTH_REVOKED" || providerError.code === "AUTH_REQUIRED");

    await db.emailAccount.update({
      where: { id: account.id },
      data: {
        activeSyncJobId: null,
        lastSyncedAt: new Date(),
        connectionError: messageText,
        ...(needsReauth ? { connectionStatus: "NEEDS_REAUTH" } : {}),
      },
    });

    if (triggeredById) {
      await db.auditLog.create({
        data: {
          organizationId: account.organizationId,
          actorUserId: triggeredById,
          action: "Email sync failed",
          entityType: "EmailAccount",
          entityId: account.id,
          metadata: { displayId, syncType, error: messageText },
        },
      });
    }

    throw err;
  }
}
