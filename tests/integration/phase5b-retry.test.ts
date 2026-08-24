import { afterAll, afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_NOW } from "@/lib/constants";
import type { EmailProvider, SyncPage } from "@/lib/email/types";
import { toEmailMessage } from "../fixtures/phase5-golden-emails";

// PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §31 — "if one email fails, do not
// fail the entire sync; allow retry." Proves the actual gap this closed:
// before Email.processingAttempts existed, a PROCESSING_FAILED row's
// existence alone made ingestMessage() treat it as "already handled"
// forever — dedup and retry used the same signal. Now a failed message is
// retried up to MAX_PROCESSING_ATTEMPTS, then left alone.

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, getEmailProviderFor: vi.fn() };
});

// processSingleEmail is Phase 3's real per-email pipeline — mocked here
// specifically to make it throw on demand, since driving a real extraction
// failure deterministically would mean fighting the classifier instead of
// testing retry bookkeeping.
vi.mock("@/lib/pipeline/orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pipeline/orchestrator")>();
  return { ...actual, processSingleEmail: vi.fn() };
});

const { getEmailProviderFor } = await import("@/lib/email");
const { processSingleEmail } = await import("@/lib/pipeline/orchestrator");
const { runAccountSync } = await import("@/lib/email/sync-engine");

const prisma = getPrismaClient();

const TEST_IDS = {
  org: "test-p5b-retry-org",
  account: "test-p5b-retry-account",
};

async function cleanup() {
  await prisma.emailAccount.deleteMany({ where: { id: TEST_IDS.account } });
  await prisma.organization.deleteMany({ where: { id: TEST_IDS.org } });
}

function makeFakeProvider(page: SyncPage): EmailProvider {
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
    initialSync: vi.fn().mockResolvedValue(page),
    incrementalSync: vi.fn().mockResolvedValue(page),
  };
}

describe("sync engine — failed-message retry with a bounded attempt cap (database)", () => {
  afterAll(cleanup);
  afterEach(() => vi.clearAllMocks());

  it("retries a PROCESSING_FAILED message on the next sync, then stops after MAX_PROCESSING_ATTEMPTS", async () => {
    await cleanup();
    await prisma.organization.create({ data: { id: TEST_IDS.org, name: "Retry Test Org", slug: "test-p5b-retry-org" } });
    await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.account,
        organizationId: TEST_IDS.org,
        userId: "banker-bharath",
        provider: "GMAIL",
        providerAccountId: "test-p5b-retry-provider-account",
        emailAddress: "retry-fixture@tattava-demo.bank",
        connectionStatus: "CONNECTED",
      },
    });

    const message = toEmailMessage(
      { id: "retry", category: "NORMAL_DEAL", subject: "Retry fixture", bodyText: "The buyer's diligence checklist for the deal is attached.", fromAddress: "buyer@example.com", fromName: "Buyer", toAddresses: ["retry-fixture@tattava-demo.bank"], sentAt: DEMO_NOW.toISOString(), notes: "" },
      { id: "retry-msg-1", providerMessageId: "retry-msg-1", providerThreadId: "retry-thread" },
    );
    const page: SyncPage = { messages: [message], hasMore: false, syncStateCursor: "cursor-1" };
    (getEmailProviderFor as unknown as Mock).mockReturnValue(makeFakeProvider(page));
    (processSingleEmail as unknown as Mock).mockRejectedValue(new Error("simulated extraction failure"));

    // Sync 1: INITIAL — ingests the message, processing fails, attempt 1.
    const first = await runAccountSync(TEST_IDS.account);
    expect(first.messagesFailed).toBe(1);

    let email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: "retry-thread" } } });
    expect(email.processingStatus).toBe("PROCESSING_FAILED");
    expect(email.processingAttempts).toBe(1);

    // Syncs 2 and 3 (INCREMENTAL): the same message re-appears from the
    // provider (its own dedup key already exists) — each retries, failing
    // again, attempts climb to 2 then 3.
    const second = await runAccountSync(TEST_IDS.account);
    expect(second.messagesFailed).toBe(1);
    expect(second.messagesSkipped).toBe(0); // retried, not skipped — attempts still under the cap

    email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: "retry-thread" } } });
    expect(email.processingAttempts).toBe(2);

    const third = await runAccountSync(TEST_IDS.account);
    expect(third.messagesFailed).toBe(1);
    email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: "retry-thread" } } });
    expect(email.processingAttempts).toBe(3);

    // Sync 4: attempts (3) have now reached MAX_PROCESSING_ATTEMPTS — this
    // sync must skip it rather than retry a fourth time (no runaway retry
    // against a message that will never succeed).
    const fourth = await runAccountSync(TEST_IDS.account);
    expect(fourth.messagesFailed).toBe(0);
    expect(fourth.messagesSkipped).toBe(1);

    email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: "retry-thread" } } });
    expect(email.processingAttempts).toBe(3); // unchanged — never attempted a 4th time
    expect(processSingleEmail).toHaveBeenCalledTimes(3);
  });

  it("a message that succeeds after a prior failure is marked PROCESSED and is not retried again", async () => {
    await cleanup();
    await prisma.organization.create({ data: { id: TEST_IDS.org, name: "Retry Test Org", slug: "test-p5b-retry-org" } });
    await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.account,
        organizationId: TEST_IDS.org,
        userId: "banker-bharath",
        provider: "GMAIL",
        providerAccountId: "test-p5b-retry-provider-account-2",
        emailAddress: "retry-fixture-2@tattava-demo.bank",
        connectionStatus: "CONNECTED",
      },
    });

    const message = toEmailMessage(
      { id: "retry2", category: "NORMAL_DEAL", subject: "Retry-then-succeed fixture", bodyText: "The buyer's diligence checklist for the deal is attached.", fromAddress: "buyer@example.com", fromName: "Buyer", toAddresses: ["retry-fixture-2@tattava-demo.bank"], sentAt: DEMO_NOW.toISOString(), notes: "" },
      { id: "retry2-msg-1", providerMessageId: "retry2-msg-1", providerThreadId: "retry2-thread" },
    );
    const page: SyncPage = { messages: [message], hasMore: false, syncStateCursor: "cursor-1" };
    (getEmailProviderFor as unknown as Mock).mockReturnValue(makeFakeProvider(page));
    (processSingleEmail as unknown as Mock).mockRejectedValueOnce(new Error("simulated transient failure")).mockImplementationOnce(
      // The real processSingleEmail (src/lib/pipeline/orchestrator.ts) sets
      // processingStatus: PROCESSED as its own side effect on success —
      // replicated here since the function itself is mocked out above.
      async (_db, _orgId, _jobId, emailId: string) => {
        await prisma.email.update({ where: { id: emailId }, data: { processingStatus: "PROCESSED", processedAt: new Date() } });
        return { relevant: true };
      },
    );

    await runAccountSync(TEST_IDS.account);
    let email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: "retry2-thread" } } });
    expect(email.processingStatus).toBe("PROCESSING_FAILED");

    const second = await runAccountSync(TEST_IDS.account);
    expect(second.messagesFailed).toBe(0);

    email = await prisma.email.findFirstOrThrow({ where: { thread: { providerThreadId: "retry2-thread" } } });
    expect(email.processingStatus).toBe("PROCESSED");
    expect(email.processingAttempts).toBe(2);

    // A third sync must not touch it again — it's PROCESSED, not failed/pending.
    const third = await runAccountSync(TEST_IDS.account);
    expect(third.messagesSkipped).toBe(1);
    expect(processSingleEmail).toHaveBeenCalledTimes(2);
  });
});
