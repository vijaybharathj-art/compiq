import "dotenv/config";
import { getPrismaClient } from "../../../src/lib/db";

// Standalone tsx-run fixture helper for tests/e2e/settings-email.spec.ts.
//
// Playwright's own TS transform (CommonJS-based) can't load the Prisma 7
// generated client (ESM-only, uses `import.meta`) the way Vitest's
// Vite-based transform can — importing src/lib/db.ts directly inside a
// Playwright spec file throws "Cannot use 'import.meta' outside a module".
// Running this file via `npx tsx` (the same runner prisma/seed.ts already
// uses successfully) sidesteps that entirely, so the spec shells out to it
// instead of importing Prisma in-process.

const prisma = getPrismaClient();

const TEST_IDS = {
  org: "org-sterling-vance", // DEMO_ORG_ID
  gmailAccount: "test-e2e-settings-gmail",
  outlookAccount: "test-e2e-settings-outlook",
};

async function cleanup() {
  await prisma.emailProcessingJob.deleteMany({ where: { emailAccountId: { in: [TEST_IDS.gmailAccount, TEST_IDS.outlookAccount] } } });
  await prisma.emailAccount.deleteMany({ where: { id: { in: [TEST_IDS.gmailAccount, TEST_IDS.outlookAccount] } } });
}

async function seedHealthyGmail() {
  const now = new Date();
  await prisma.emailAccount.create({
    data: {
      id: TEST_IDS.gmailAccount,
      organizationId: TEST_IDS.org,
      userId: "banker-bharath",
      provider: "GMAIL",
      providerAccountId: "e2e-fixture-gmail-provider-account",
      emailAddress: "e2e-fixture@tattava-demo.bank",
      connectionStatus: "CONNECTED",
      initialSyncCompleted: true,
      lastSyncedAt: now,
      lastSuccessfulSyncAt: now,
    },
  });
  await prisma.emailProcessingJob.create({
    data: {
      displayId: "SYNC-E2E-FIXTURE-001",
      organizationId: TEST_IDS.org,
      emailAccountId: TEST_IDS.gmailAccount,
      syncType: "INITIAL",
      status: "COMPLETED",
      processedCount: 42,
      relevantCount: 9,
      startedAt: now,
      finishedAt: now,
    },
  });
}

async function seedReauthOutlook() {
  await prisma.emailAccount.create({
    data: {
      id: TEST_IDS.outlookAccount,
      organizationId: TEST_IDS.org,
      userId: "banker-bharath",
      provider: "OUTLOOK",
      providerAccountId: "e2e-fixture-outlook-provider-account",
      emailAddress: "e2e-fixture-outlook@tattava-demo.bank",
      connectionStatus: "NEEDS_REAUTH",
      connectionError: "The refresh token was revoked. Reconnect this mailbox to resume syncing.",
      initialSyncCompleted: true,
      lastSuccessfulSyncAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    },
  });
}

async function verifyGmailDisconnected() {
  const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: TEST_IDS.gmailAccount } });
  const ok = account.connectionStatus === "DISCONNECTED" && account.accessTokenEncrypted === null && account.refreshTokenEncrypted === null;
  if (!ok) {
    console.error("FAIL", JSON.stringify(account));
    process.exitCode = 1;
    return;
  }
  console.log("OK");
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "cleanup":
      await cleanup();
      break;
    case "seed-healthy-gmail":
      await cleanup();
      await seedHealthyGmail();
      break;
    case "seed-reauth-outlook":
      await seedReauthOutlook();
      break;
    case "verify-gmail-disconnected":
      await verifyGmailDisconnected();
      break;
    default:
      throw new Error(`Unknown fixture command: ${cmd}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
