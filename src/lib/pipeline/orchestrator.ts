import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db";
import { getAIProvider } from "@/lib/ai";
import { getEmailProvider } from "@/lib/email";
import type { EmailMessage } from "@/lib/email/types";
import { buildEmailInput, syncParticipants } from "./normalization";
import { buildClassificationContext, classifyEmail } from "./classification";
import { matchClient, matchDeal } from "./matching";
import { applyDealChanges } from "./suggestions";
import { generateMeetings, generateOpportunity, generateRiskEvents, generateTasks } from "./generation";
import { emptyScanCounters, type ScanCounters } from "./types";
import { PIPELINE_STAGES } from "./stages";
import { runInactivityScan } from "@/lib/intelligence/inactivity";
import { runDeadlineScan } from "@/lib/intelligence/deadline";

// The orchestrator (spec §26/§32/§34). Ties every pipeline stage together
// per email inside one EmailProcessingJob. Deliberately sequential — a
// simple in-process queue, not a real worker pool — but every stage
// transition is logged against the job (EmailProcessingLog) with
// metadata-only messages (never full email bodies, per spec §36), so the
// same shape of observability carries over cleanly to a real queue
// (BullMQ/SQS/Inngest — see PHASE3_EMAIL_INTELLIGENCE.md §34/§44) later.

// Purely for progress-UI legibility against a demo dataset that processes
// in milliseconds — every write in each stage is real; this only paces
// how fast the job's `stage` column advances so the "Run Scan" UI (spec
// §26) has something visible to show, not to simulate work that isn't
// happening.
const STAGE_PACING_MS = 180;

async function log(
  db: PrismaClient,
  jobId: string,
  stage: string,
  level: "info" | "warn" | "error",
  message: string,
  emailId?: string,
) {
  await db.emailProcessingLog.create({ data: { jobId, stage, level, message, emailId } });
}

async function nextDisplayId(db: PrismaClient): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const countToday = await db.emailProcessingJob.count({
    where: { displayId: { startsWith: `SCAN-${today}` } },
  });
  return `SCAN-${today}-${String(countToday + 1).padStart(3, "0")}`;
}

interface ProcessOutcome {
  relevant: boolean;
}

async function processSingleEmail(
  db: PrismaClient,
  organizationId: string,
  jobId: string,
  emailId: string,
  message: EmailMessage,
  threadId: string,
  knownClientNames: string[],
  knownCompanyNames: string[],
  counters: ScanCounters,
): Promise<ProcessOutcome> {
  const aiProvider = getAIProvider();
  const emailInput = buildEmailInput(emailId, message);

  await syncParticipants(db, emailId, message);

  const classificationContext = await buildClassificationContext(
    db,
    { emailId, threadId, fromAddress: message.fromAddress },
    knownClientNames,
    knownCompanyNames,
  );
  const relevance = await classifyEmail(db, aiProvider, emailInput, classificationContext);
  await log(db, jobId, "classification", "info", `relevance=${relevance.relevance} confidence=${relevance.confidencePercent}%`, emailId);

  if (relevance.relevance === "NOT_RELEVANT") {
    await db.email.update({ where: { id: emailId }, data: { processingStatus: "PROCESSED", processedAt: new Date() } });
    return { relevant: false };
  }

  const extraction = await aiProvider.extractEntities(emailInput, { organizationId, candidateDeals: [] });
  await log(db, jobId, "extraction", "info", `confidence=${extraction.confidencePercent}% promptVersion=${extraction.promptVersion}`, emailId);

  const participants = await db.emailParticipant.findMany({ where: { emailId }, select: { contactId: true } });
  const contactIds = participants.map((p) => p.contactId).filter((id): id is string => Boolean(id));
  const clientId = await matchClient(db, organizationId, extraction, contactIds);
  await log(db, jobId, "client-matching", "info", clientId ? `matched clientId=${clientId}` : "no client match", emailId);

  const matchDecision = await matchDeal(db, aiProvider, organizationId, threadId, clientId, extraction);
  await log(
    db,
    jobId,
    "deal-matching",
    "info",
    `matchType=${matchDecision.matchType} confidence=${matchDecision.confidencePercent}% dealId=${matchDecision.dealId ?? "none"}`,
    emailId,
  );

  const occurredAt = message.receivedAt;

  if (matchDecision.matchType === "EXISTING_DEAL" && matchDecision.dealId) {
    if (!threadId) throw new Error("Missing threadId for matched deal.");
    await db.emailThread.update({ where: { id: threadId }, data: { dealId: matchDecision.dealId, clientId: clientId ?? undefined } });

    await applyDealChanges(
      db,
      {
        organizationId,
        emailId,
        dealId: matchDecision.dealId,
        extraction,
        matchDecision,
        processingJobId: jobId,
        occurredAt,
      },
      counters,
    );
  }

  await generateTasks(db, { organizationId, emailId, dealId: matchDecision.dealId ?? null, clientId, extraction, processingJobId: jobId, occurredAt }, counters);
  await generateMeetings(db, { organizationId, emailId, dealId: matchDecision.dealId ?? null, clientId, extraction, processingJobId: jobId, occurredAt });
  await generateRiskEvents(db, { organizationId, emailId, dealId: matchDecision.dealId ?? null, clientId, extraction, processingJobId: jobId, occurredAt }, counters);
  await generateOpportunity(db, { organizationId, emailId, dealId: matchDecision.dealId ?? null, clientId, extraction, processingJobId: jobId, occurredAt }, matchDecision, counters);

  await db.email.update({ where: { id: emailId }, data: { processingStatus: "PROCESSED", processedAt: new Date() } });
  return { relevant: true };
}

export interface RunScanResult {
  jobId: string;
  displayId: string;
  counters: ScanCounters;
}

// Thrown when a scan is requested while another is already running for the
// same organization (spec §34 "do not start duplicate jobs") — distinct
// from a generic Error so the UI can show "Scan in progress" rather than a
// raw failure message.
export class ScanAlreadyRunningError extends Error {
  constructor() {
    super("A scan is already in progress for this organization.");
    this.name = "ScanAlreadyRunningError";
  }
}

export async function runScan(organizationId: string, triggeredById?: string): Promise<RunScanResult> {
  const db = getPrismaClient();

  const alreadyRunning = await db.emailProcessingJob.findFirst({
    where: { organizationId, status: "RUNNING" },
  });
  if (alreadyRunning) throw new ScanAlreadyRunningError();

  const displayId = await nextDisplayId(db);
  const counters = emptyScanCounters();

  const job = await db.emailProcessingJob.create({
    data: { displayId, organizationId, status: "RUNNING", triggeredById, stage: PIPELINE_STAGES[0], startedAt: new Date() },
  });

  try {
    const account = await db.emailAccount.findFirst({ where: { organizationId } });
    if (!account) throw new Error("No EmailAccount configured for this organization.");

    await log(db, job.id, "ingestion", "info", `job ${displayId} started`);
    await setStage(db, job.id, PIPELINE_STAGES[0]);

    const provider = getEmailProvider();
    const messages = await provider.getNewMessages(account.id);
    counters.totalEmails = messages.length;
    await db.emailProcessingJob.update({ where: { id: job.id }, data: { totalEmails: messages.length } });

    await setStage(db, job.id, PIPELINE_STAGES[1]);

    const [clients, companies] = await Promise.all([
      db.client.findMany({ where: { organizationId }, select: { name: true } }),
      db.company.findMany({ where: { organizationId }, select: { name: true } }),
    ]);
    const knownClientNames = clients.map((c) => c.name);
    const knownCompanyNames = companies.map((c) => c.name);

    await setStage(db, job.id, PIPELINE_STAGES[2]);

    for (const message of messages) {
      const emailRow = await db.email.findUnique({ where: { id: message.id }, select: { threadId: true } });
      if (!emailRow) continue;

      try {
        await db.email.update({ where: { id: message.id }, data: { processingStatus: "PROCESSING", processingJobId: job.id } });
        const outcome = await processSingleEmail(
          db,
          organizationId,
          job.id,
          message.id,
          message,
          emailRow.threadId,
          knownClientNames,
          knownCompanyNames,
          counters,
        );
        await provider.markProcessed(account.id, message.providerMessageId);
        counters.processedCount += 1;
        if (outcome.relevant) counters.relevantCount += 1;
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        await db.email.update({
          where: { id: message.id },
          data: { processingStatus: "PROCESSING_FAILED", processingError: messageText },
        });
        await log(db, job.id, "error", "error", `email ${message.id} failed: ${messageText}`, message.id);
        counters.processedCount += 1;
      }
    }

    await setStage(db, job.id, PIPELINE_STAGES[3]);
    await sleep(STAGE_PACING_MS);
    await setStage(db, job.id, PIPELINE_STAGES[4]);
    await sleep(STAGE_PACING_MS);
    await setStage(db, job.id, PIPELINE_STAGES[5]);

    // Deal Intelligence passes (Phase 4) — org-wide, not per-email, so they
    // run once at the end of the scan rather than inside processSingleEmail.
    // Kept out of counters.risksDetected on purpose: inactivity is never
    // auto-classified as risk (spec §59) — DEAL_INACTIVE events are their
    // own event type, surfaced separately in the scan summary UI.
    const inactivityResult = await runInactivityScan(organizationId);
    await log(db, job.id, "inactivity-scan", "info", `${inactivityResult.createdCount} deal(s) newly flagged inactive`);
    const deadlineResult = await runDeadlineScan(organizationId);
    await log(db, job.id, "deadline-scan", "info", `${deadlineResult.escalatedCount} overdue task(s) escalated`);

    await sleep(STAGE_PACING_MS);

    await db.emailProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        stage: "Scan complete",
        finishedAt: new Date(),
        processedCount: counters.processedCount,
        relevantCount: counters.relevantCount,
        dealsUpdated: counters.dealsUpdated,
        tasksCreated: counters.tasksCreated,
        opportunitiesCreated: counters.opportunitiesCreated,
        risksDetected: counters.risksDetected,
        suggestionsForReview: counters.suggestionsForReview,
      },
    });

    if (triggeredById) {
      await db.auditLog.create({
        data: {
          organizationId,
          actorUserId: triggeredById,
          action: "Email scan completed",
          entityType: "EmailProcessingJob",
          entityId: job.id,
          metadata: { displayId, ...counters },
        },
      });
    }

    return { jobId: job.id, displayId, counters };
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    await db.emailProcessingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: messageText, finishedAt: new Date() },
    });
    await log(db, job.id, "orchestrator", "error", `scan failed: ${messageText}`);
    throw err;
  }
}

async function setStage(db: PrismaClient, jobId: string, stage: string) {
  await db.emailProcessingJob.update({ where: { id: jobId }, data: { stage } });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
