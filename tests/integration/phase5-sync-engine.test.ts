import { afterAll, afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_NOW } from "@/lib/constants";
import type { EmailProvider, SyncPage } from "@/lib/email/types";
import { toEmailMessage, VALUATION_CHANGE_SCENARIOS } from "../fixtures/phase5-golden-emails";

// PHASE5_REAL_EMAIL_INTEGRATION.md §69, §76-78 — the sync engine
// (src/lib/email/sync-engine.ts) exercised against a fake EmailProvider
// (never a real network call, never real confidential mail — spec's
// explicit constraint) so ingestion, dedup, resumability, and the
// single-flight guard are proven against the real runAccountSync()
// implementation, not a reimplementation of it.

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, getEmailProviderFor: vi.fn() };
});

const { getEmailProviderFor } = await import("@/lib/email");
const { runAccountSync, SyncAlreadyRunningError } = await import("@/lib/email/sync-engine");

const prisma = getPrismaClient();

const TEST_IDS = {
  org: "test-p5-sync-org",
  account: "test-p5-sync-account",
};

async function cleanup() {
  // Cascades EmailThread -> Email -> EmailAttachment/AiExtraction/etc, and
  // EmailProcessingJob (emailAccountId FK, onDelete: Cascade).
  await prisma.emailAccount.deleteMany({ where: { id: TEST_IDS.account } });
  await prisma.organization.deleteMany({ where: { id: TEST_IDS.org } });
}

async function makeAccount() {
  // A dedicated organization, not DEMO_ORG_ID — runAccountSync() runs the
  // same org-wide Phase 4 passes (inactivity/deadline scans) runScan()
  // does, against every real deal in the org. Running those against
  // DEMO_ORG_ID here would pollute the shared seeded state other test
  // files (e.g. tests/integration/deal-intelligence.test.ts) assert
  // tightly against — this test only needs *an* organization to attach an
  // EmailAccount to, not the seeded demo one.
  await prisma.organization.create({ data: { id: TEST_IDS.org, name: "Sync Engine Test Org", slug: "test-p5-sync-org" } });
  return prisma.emailAccount.create({
    data: {
      id: TEST_IDS.account,
      organizationId: TEST_IDS.org,
      userId: "banker-bharath",
      provider: "GMAIL",
      providerAccountId: "test-p5-provider-account-id", // marks this as a "real" Phase 5 connection, not the seeded Demo Mode account
      emailAddress: "sync-fixture@tattava-demo.bank",
      connectionStatus: "CONNECTED",
      initialSyncWindowDays: 90,
    },
  });
}

/** A minimal fake EmailProvider — only the methods runAccountSync actually calls. */
function makeFakeProvider(pages: { initial: SyncPage; incremental: SyncPage }): EmailProvider {
  return {
    getThreads: vi.fn(),
    getThread: vi.fn(),
    getMessages: vi.fn(),
    getMessage: vi.fn(),
    getNewMessages: vi.fn(),
    getAttachments: vi.fn(),
    downloadAttachment: vi.fn(),
    markProcessed: vi.fn(),
    watch: vi.fn(),
    disconnect: vi.fn(),
    getConnectionStatus: vi.fn(),
    refreshAuthentication: vi.fn(),
    handleProviderError: (error: unknown) => (error instanceof Error ? (error as never) : new Error(String(error))) as never,
    initialSync: vi.fn().mockResolvedValue(pages.initial),
    incrementalSync: vi.fn().mockResolvedValue(pages.incremental),
  };
}

describe("sync engine — ingestion, dedup, resumability (database)", () => {
  afterAll(cleanup);
  afterEach(() => vi.clearAllMocks());

  it("processing the identical message across 1/2/5/10 syncs yields exactly one Email row, while a distinct forwarded message (different providerMessageId, same thread) is legitimately its own row", async () => {
    await cleanup();
    await makeAccount();

    const original = toEmailMessage(
      { id: "dedup", category: "NORMAL_DEAL", subject: "Diligence checklist", bodyText: "The buyer's diligence checklist for the deal is attached.", fromAddress: "buyer@example.com", fromName: "Buyer Contact", toAddresses: ["sync-fixture@tattava-demo.bank"], sentAt: DEMO_NOW.toISOString(), notes: "" },
      { id: "dedup-msg-1", providerMessageId: "dedup-msg-1", providerThreadId: "dedup-thread" },
    );

    const page: SyncPage = { messages: [original], hasMore: false, syncStateCursor: "cursor-1" };
    const provider = makeFakeProvider({ initial: page, incremental: page });
    (getEmailProviderFor as unknown as Mock).mockReturnValue(provider);

    // Call 1: INITIAL sync (account.initialSyncCompleted starts false).
    const first = await runAccountSync(TEST_IDS.account);
    expect(first.syncType).toBe("INITIAL");
    expect(first.messagesFetched).toBe(1);
    expect(first.messagesSkipped).toBe(0);

    let emailCount = await prisma.email.count({ where: { thread: { providerThreadId: "dedup-thread" } } });
    expect(emailCount).toBe(1);

    // Calls 2-5: INCREMENTAL syncs re-fetching the SAME message (a real
    // provider can legitimately re-list a recently-touched message) —
    // every one must skip it, never reprocess or duplicate it.
    for (let i = 0; i < 4; i++) {
      const result = await runAccountSync(TEST_IDS.account);
      expect(result.syncType).toBe("INCREMENTAL");
      expect(result.messagesSkipped).toBe(1);
    }

    emailCount = await prisma.email.count({ where: { thread: { providerThreadId: "dedup-thread" } } });
    expect(emailCount).toBe(1);

    // Calls 6-10: five more — dedup holds at higher multiplicity too.
    for (let i = 0; i < 5; i++) {
      await runAccountSync(TEST_IDS.account);
    }
    emailCount = await prisma.email.count({ where: { thread: { providerThreadId: "dedup-thread" } } });
    expect(emailCount).toBe(1);

    const totalSyncJobs = await prisma.emailProcessingJob.count({ where: { emailAccountId: TEST_IDS.account } });
    expect(totalSyncJobs).toBe(10);

    // A forwarded copy — a genuinely distinct provider message id, in the
    // same thread, whose body quotes the original — must NOT be deduped
    // away (it's real, new correspondence), but must also not be
    // double-counted as if the original had changed.
    const forwarded = toEmailMessage(
      { id: "dedup", category: "NORMAL_DEAL", subject: "Fwd: Diligence checklist", bodyText: "Please see below.\n\nFrom: Buyer Contact\nSent: earlier\nTo: Someone\nSubject: Diligence checklist\n\nThe buyer's diligence checklist for the deal is attached.", fromAddress: "internal@tattava-demo.bank", fromName: "Internal Banker", toAddresses: ["sync-fixture@tattava-demo.bank"], sentAt: DEMO_NOW.toISOString(), notes: "" },
      { id: "dedup-msg-2-forward", providerMessageId: "dedup-msg-2-forward", providerThreadId: "dedup-thread" },
    );
    const forwardPage: SyncPage = { messages: [forwarded], hasMore: false, syncStateCursor: "cursor-2" };
    (getEmailProviderFor as unknown as Mock).mockReturnValue(makeFakeProvider({ initial: forwardPage, incremental: forwardPage }));

    const forwardResult = await runAccountSync(TEST_IDS.account);
    expect(forwardResult.messagesSkipped).toBe(0); // a genuinely new message, not a dupe

    emailCount = await prisma.email.count({ where: { thread: { providerThreadId: "dedup-thread" } } });
    expect(emailCount).toBe(2); // original + forward, never merged, never tripled
  });

  it("attachment metadata is persisted without ever downloading content (Phase 5A)", async () => {
    await cleanup();
    await makeAccount();

    const message = toEmailMessage(
      { id: "attach", category: "NORMAL_DEAL", subject: "Data room export", bodyText: "The buyer's data room export for the deal is attached.", fromAddress: "buyer@example.com", fromName: "Buyer Contact", toAddresses: ["sync-fixture@tattava-demo.bank"], sentAt: DEMO_NOW.toISOString(), notes: "" },
      {
        id: "attach-msg-1",
        providerMessageId: "attach-msg-1",
        providerThreadId: "attach-thread",
        attachments: [{ id: "att-1", filename: "financials.xlsx", mimeType: "application/vnd.ms-excel", sizeBytes: 204_800 }],
      },
    );
    const page: SyncPage = { messages: [message], hasMore: false, syncStateCursor: "cursor-1" };
    (getEmailProviderFor as unknown as Mock).mockReturnValue(makeFakeProvider({ initial: page, incremental: page }));

    await runAccountSync(TEST_IDS.account);

    const email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: "attach-thread" } }, include: { attachments: true } });
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0]!.filename).toBe("financials.xlsx");
    expect(email.attachments[0]!.sizeBytes).toBe(204_800);
    // Never a real object reference — Phase 5A never downloads content.
    expect(email.attachments[0]!.storageRef).toMatch(/^not-downloaded:/);

    const provider = (getEmailProviderFor as unknown as Mock).mock.results[0]!.value as EmailProvider;
    expect(provider.downloadAttachment).not.toHaveBeenCalled();
  });

  it("a bounded valuation-change golden email syncs, ingests, and is available for pipeline processing", async () => {
    await cleanup();
    await makeAccount();

    const vc = VALUATION_CHANGE_SCENARIOS[0]!;
    const message = toEmailMessage(vc, { id: `${vc.id}-sync-msg`, providerMessageId: `${vc.id}-sync-msg`, providerThreadId: `${vc.id}-sync-thread` });
    const page: SyncPage = { messages: [message], hasMore: false, syncStateCursor: "cursor-1" };
    (getEmailProviderFor as unknown as Mock).mockReturnValue(makeFakeProvider({ initial: page, incremental: page }));

    const result = await runAccountSync(TEST_IDS.account, "banker-bharath");
    expect(result.messagesFetched).toBe(1);

    const email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: `${vc.id}-sync-thread` } } });
    expect(email.processingStatus).toBe("PROCESSED");

    const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: TEST_IDS.account } });
    expect(account.activeSyncJobId).toBeNull(); // released after completion
    expect(account.initialSyncCompleted).toBe(true);
    expect(account.lastSuccessfulSyncAt).not.toBeNull();

    const auditEntry = await prisma.auditLog.findFirst({ where: { entityId: TEST_IDS.account, action: { contains: "sync completed" } } });
    expect(auditEntry).not.toBeNull();
  });
});

describe("sync engine — single-flight guard (database)", () => {
  afterAll(cleanup);

  it("refuses to start a second sync while one is already RUNNING for the same account", async () => {
    await cleanup();
    await makeAccount();

    const stuckJob = await prisma.emailProcessingJob.create({
      data: { displayId: "SYNC-TEST-STUCK-001", organizationId: TEST_IDS.org, emailAccountId: TEST_IDS.account, syncType: "INITIAL", status: "RUNNING", startedAt: new Date() },
    });
    await prisma.emailAccount.update({ where: { id: TEST_IDS.account }, data: { activeSyncJobId: stuckJob.id } });

    await expect(runAccountSync(TEST_IDS.account)).rejects.toBeInstanceOf(SyncAlreadyRunningError);
  });
});
