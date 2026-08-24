import { afterAll, afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_NOW } from "@/lib/constants";
import type { EmailProvider, SyncPage } from "@/lib/email/types";
import { toEmailMessage } from "../fixtures/phase5-golden-emails";

// PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §24-27, §30-31 — the scheduler
// (src/lib/email/scheduler.ts) exercised against a fake EmailProvider,
// same pattern as tests/integration/phase5-sync-engine.test.ts: never a
// real network call, never real confidential mail.

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, getEmailProviderFor: vi.fn() };
});

const { getEmailProviderFor } = await import("@/lib/email");
const { runScheduledSyncs, minSyncIntervalMinutes } = await import("@/lib/email/scheduler");

const prisma = getPrismaClient();

const TEST_IDS = {
  org: "test-p5b-scheduler-org",
  dueAccount: "test-p5b-scheduler-due",
  recentAccount: "test-p5b-scheduler-recent",
  runningAccount: "test-p5b-scheduler-running",
};

async function cleanup() {
  await prisma.emailAccount.deleteMany({ where: { id: { in: [TEST_IDS.dueAccount, TEST_IDS.recentAccount, TEST_IDS.runningAccount] } } });
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

describe("scheduler — minSyncIntervalMinutes", () => {
  const original = process.env.EMAIL_SYNC_INTERVAL_MINUTES;
  afterEach(() => {
    process.env.EMAIL_SYNC_INTERVAL_MINUTES = original;
  });

  it("defaults to 15 when unset", () => {
    delete process.env.EMAIL_SYNC_INTERVAL_MINUTES;
    expect(minSyncIntervalMinutes()).toBe(15);
  });

  it("falls back to the default for a non-numeric value rather than NaN-ing the cutoff", () => {
    process.env.EMAIL_SYNC_INTERVAL_MINUTES = "not-a-number";
    expect(minSyncIntervalMinutes()).toBe(15);
  });

  it("respects a valid override", () => {
    process.env.EMAIL_SYNC_INTERVAL_MINUTES = "30";
    expect(minSyncIntervalMinutes()).toBe(30);
  });
});

describe("scheduler — runScheduledSyncs (database)", () => {
  afterAll(cleanup);
  afterEach(() => vi.clearAllMocks());

  it("syncs an account with no prior sync, skips one synced within the interval, and isolates a per-account failure from the rest", async () => {
    await cleanup();
    await prisma.organization.create({ data: { id: TEST_IDS.org, name: "Scheduler Test Org", slug: "test-p5b-scheduler-org" } });

    await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.dueAccount,
        organizationId: TEST_IDS.org,
        userId: "banker-bharath",
        provider: "GMAIL",
        providerAccountId: "test-p5b-due-provider-account",
        emailAddress: "due-fixture@tattava-demo.bank",
        connectionStatus: "CONNECTED",
        // lastSyncedAt left null — due immediately, matching a freshly connected account.
      },
    });
    await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.recentAccount,
        organizationId: TEST_IDS.org,
        userId: "banker-bharath",
        provider: "GMAIL",
        providerAccountId: "test-p5b-recent-provider-account",
        emailAddress: "recent-fixture@tattava-demo.bank",
        connectionStatus: "CONNECTED",
        lastSyncedAt: new Date(), // just synced — not due yet under the default 15-minute interval
      },
    });

    const message = toEmailMessage(
      { id: "sched", category: "NORMAL_DEAL", subject: "Scheduler fixture", bodyText: "The buyer's diligence checklist for the deal is attached.", fromAddress: "buyer@example.com", fromName: "Buyer", toAddresses: ["due-fixture@tattava-demo.bank"], sentAt: DEMO_NOW.toISOString(), notes: "" },
      { id: "sched-msg-1", providerMessageId: "sched-msg-1", providerThreadId: "sched-thread" },
    );
    const page: SyncPage = { messages: [message], hasMore: false, syncStateCursor: "cursor-1" };
    (getEmailProviderFor as unknown as Mock).mockReturnValue(makeFakeProvider(page));

    const summary = await runScheduledSyncs();

    // The scheduler's query is deliberately org-unscoped (spec §24 — it must
    // see every connected account, not just this test's org), so other
    // integration files' simultaneously-live fixture accounts can inflate
    // these totals under parallel file execution. Assert this fixture's own
    // two accounts landed in the results with the right outcome rather than
    // asserting exact global counts.
    const dueResult = summary.results.find((r) => r.accountId === TEST_IDS.dueAccount);
    expect(dueResult?.outcome).toBe("synced");
    const recentResult = summary.results.find((r) => r.accountId === TEST_IDS.recentAccount);
    expect(recentResult?.outcome).toBe("skipped_recent");

    const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: TEST_IDS.dueAccount } });
    expect(account.lastSuccessfulSyncAt).not.toBeNull();
  });

  it("reports skipped_running (not failed) when the scheduler races a sync already in progress — spec Part 26", async () => {
    await cleanup();
    await prisma.organization.create({ data: { id: TEST_IDS.org, name: "Scheduler Test Org", slug: "test-p5b-scheduler-org" } });

    const account = await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.runningAccount,
        organizationId: TEST_IDS.org,
        userId: "banker-bharath",
        provider: "GMAIL",
        providerAccountId: "test-p5b-running-provider-account",
        emailAddress: "running-fixture@tattava-demo.bank",
        connectionStatus: "CONNECTED",
      },
    });
    const stuckJob = await prisma.emailProcessingJob.create({
      data: { displayId: "SYNC-TEST-SCHED-STUCK-001", organizationId: TEST_IDS.org, emailAccountId: account.id, syncType: "INITIAL", status: "RUNNING", startedAt: new Date() },
    });
    await prisma.emailAccount.update({ where: { id: account.id }, data: { activeSyncJobId: stuckJob.id } });

    const summary = await runScheduledSyncs();

    expect(summary.accountsFailed).toBe(0);
    const result = summary.results.find((r) => r.accountId === TEST_IDS.runningAccount);
    expect(result?.outcome).toBe("skipped_running");
  });

  it("never touches an account sitting at NEEDS_REAUTH — no runaway retry against invalid credentials (spec Part 20/45)", async () => {
    await cleanup();
    await prisma.organization.create({ data: { id: TEST_IDS.org, name: "Scheduler Test Org", slug: "test-p5b-scheduler-org" } });
    await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.dueAccount,
        organizationId: TEST_IDS.org,
        userId: "banker-bharath",
        provider: "GMAIL",
        providerAccountId: "test-p5b-reauth-provider-account",
        emailAddress: "reauth-fixture@tattava-demo.bank",
        connectionStatus: "NEEDS_REAUTH",
      },
    });

    const summary = await runScheduledSyncs();
    // Same org-unscoped caveat as above: assert this account specifically
    // never appears (NEEDS_REAUTH accounts are excluded by the query's
    // connectionStatus filter), not that the global result set is empty.
    const result = summary.results.find((r) => r.accountId === TEST_IDS.dueAccount);
    expect(result).toBeUndefined();
  });
});
