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
// PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §31 — a PROCESSING_FAILED email is
// retried on the next sync (its Email row already exists, so dedup alone
// would otherwise skip it forever), but only up to this many attempts —
// past that, a message that will never succeed stops being retried
// indefinitely (spec Part 21's "no runaway retry" applied at the
// per-message level, not just per-account auth failures).
const MAX_PROCESSING_ATTEMPTS = 3;

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

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

const MAX_DISPLAY_ID_RETRIES = 5;

/**
 * Creates the EmailProcessingJob row for one sync, with a human-readable
 * `SYNC-YYYYMMDD-NNN` displayId derived by counting today's existing jobs.
 * That count-then-create is a real TOCTOU race the moment more than one
 * sync can run at once — which the scheduler's bounded concurrency
 * (src/lib/email/scheduler.ts, up to MAX_CONCURRENT_ACCOUNT_SYNCS accounts
 * syncing in parallel) made genuinely reachable, not just theoretical.
 * Retrying past the unique constraint (Postgres P2002) rather than
 * widening the race window with a lock keeps the ids sequential and
 * readable in the common case, and self-heals on the rare collision.
 */
async function createSyncJob(
  db: PrismaClient,
  data: { organizationId: string; emailAccountId: string; syncType: "INITIAL" | "INCREMENTAL"; triggeredById?: string },
) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (let attempt = 0; attempt < MAX_DISPLAY_ID_RETRIES; attempt++) {
    const countToday = await db.emailProcessingJob.count({ where: { displayId: { startsWith: `SYNC-${today}` } } });
    const displayId = `SYNC-${today}-${String(countToday + 1 + attempt).padStart(3, "0")}`;
    try {
      return await db.emailProcessingJob.create({
        data: {
          displayId,
          organizationId: data.organizationId,
          emailAccountId: data.emailAccountId,
          syncType: data.syncType,
          status: "RUNNING",
          triggeredById: data.triggeredById,
          stage: PIPELINE_STAGES[0],
          startedAt: new Date(),
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < MAX_DISPLAY_ID_RETRIES - 1) continue;
      throw err;
    }
  }
  throw new Error("Could not allocate a unique sync displayId after multiple attempts.");
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
  /** True for a brand-new message, or an existing one still worth attempting (PENDING, or PROCESSING_FAILED under MAX_PROCESSING_ATTEMPTS). False for an already-PROCESSED message, or one that exhausted its retries. */
  shouldProcess: boolean;
}

/**
 * Upserts EmailThread + Email for one freshly fetched message, deduplicating
 * on the schema's own compound unique keys (spec §18 — processing the same
 * message 1/2/5/10 times must yield exactly one Email row). Attachment
 * metadata is persisted (filename/type/size) but content is never
 * downloaded in Phase 5A (spec §20) — storageRef records that explicitly
 * rather than pointing at a real object.
 *
 * An existing row isn't automatically "already handled" — a message that
 * previously failed processing (PROCESSING_FAILED) is retried here rather
 * than silently skipped forever, up to MAX_PROCESSING_ATTEMPTS.
 */
async function ingestMessage(db: PrismaClient, accountId: string, jobId: string, message: EmailMessage): Promise<IngestOutcome> {
  const threadId = await upsertThread(db, accountId, message);

  const existing = await db.email.findUnique({
    where: { threadId_providerMessageId: { threadId, providerMessageId: message.providerMessageId } },
  });
  if (existing) {
    const retryable =
      (existing.processingStatus === "PROCESSING_FAILED" || existing.processingStatus === "PENDING") &&
      existing.processingAttempts < MAX_PROCESSING_ATTEMPTS;
    return { emailId: existing.id, threadId, isNew: false, shouldProcess: retryable };
  }

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

  return { emailId: created.id, threadId, isNew: true, shouldProcess: true };
}

/**
 * Runs (or resumes) a sync for one connected mailbox — triggered either by
 * a banker's "Sync Now" click (spec §26, §76-78) or, as of Phase 5B, the
 * Vercel Cron scheduler (src/lib/email/scheduler.ts) calling accounts due
 * for automatic incremental sync. Guarded single-flight via
 * EmailAccount.activeSyncJobId — the same guard makes a manual click and a
 * concurrent scheduled run race safely regardless of which one started
 * first. Determines INITIAL vs. INCREMENTAL from
 * EmailAccount.initialSyncCompleted; fetches through the account's
 * EmailProvider; ingests and dedupes each message; hands every genuinely
 * new (or retry-eligible) message to the unmodified Phase 3
 * processSingleEmail(); then runs the same Phase 4 org-wide passes
 * (inactivity/deadline) runScan() does.
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
  const counters: ScanCounters = emptyScanCounters();

  const job = await createSyncJob(db, { organizationId: account.organizationId, emailAccountId: account.id, syncType, triggeredById });
  const displayId = job.displayId;

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

        if (!ingestOutcome.isNew && !ingestOutcome.shouldProcess) {
          // Either already PROCESSED, or PROCESSING_FAILED past
          // MAX_PROCESSING_ATTEMPTS — a genuine duplicate/exhausted
          // message, not just "not new" (spec §31: failed messages get a
          // bounded number of retries, not zero and not infinite).
          messagesSkipped += 1;
          continue;
        }

        try {
          await setStage(db, job.id, PIPELINE_STAGES[2]);
          await db.email.update({
            where: { id: ingestOutcome.emailId },
            data: { processingStatus: "PROCESSING", processingJobId: job.id, processingAttempts: { increment: 1 } },
          });
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
