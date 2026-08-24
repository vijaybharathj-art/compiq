import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";

// End-to-end coverage for Settings → Email (PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md
// §47) — Connect UI, connection status, sync history, the health banner, and
// reconnect/disconnect. Deliberately does NOT click "Sync Now" against a real
// account: that Server Action calls the real GmailProvider/MicrosoftGraphProvider,
// which would attempt a live OAuth token refresh against Google/Microsoft — this
// sandbox has no real OAuth app credentials or a live mailbox to sync, so that
// specific path (live sync execution) is exercised only by the mocked
// tests/integration/phase5-sync-engine.test.ts and tests/integration/phase5b-*
// suites, never here. What IS real here: every DB write these tests assert on
// happens through the actual Server Actions in src/lib/actions/email-actions.ts
// and the actual Settings → Email page/component — no mocking on the app side.
//
// Fixtures are seeded/verified by shelling out to
// tests/e2e/fixtures/settings-email-fixtures.ts via tsx rather than importing
// Prisma directly in this file — Playwright's own CommonJS-based TS transform
// can't load the Prisma 7 generated client (ESM-only, uses `import.meta`) the
// way Vitest's Vite-based transform can.

const FIXTURES_SCRIPT = path.resolve(__dirname, "fixtures/settings-email-fixtures.ts");

function runFixtureCommand(command: string) {
  execFileSync("npx", ["tsx", FIXTURES_SCRIPT, command], { cwd: path.resolve(__dirname, "../.."), stdio: "inherit" });
}

test.describe.serial("Settings → Email", () => {
  test.beforeAll(() => runFixtureCommand("cleanup"));
  test.afterAll(() => runFixtureCommand("cleanup"));

  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Bharath Vijay").click();
    await page.waitForURL("**/dashboard");
  });

  test("Gmail and Outlook show as not connected, with Connect disabled when OAuth isn't configured", async ({ page }) => {
    // This sandbox's local .env has no GOOGLE_CLIENT_ID/MICROSOFT_CLIENT_ID —
    // the same "not configured" state a fresh Tattava deployment starts in
    // before a banker's admin sets up OAuth credentials (see
    // PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md Part 83 for how to configure them
    // for real, e.g. against compiq-sand.vercel.app).
    await page.goto("/settings/email");
    await expect(page.getByText("Connect a real mailbox so Tattava can build deal intelligence from it.")).toBeVisible();

    const gmailCard = page.locator('[data-slot="card"]').filter({ hasText: "Gmail" }).first();
    await expect(gmailCard.getByText("Not configured — set OAuth credentials in the environment")).toBeVisible();
    await expect(gmailCard.getByRole("button", { name: "Connect" })).toBeDisabled();

    const outlookCard = page.locator('[data-slot="card"]').filter({ hasText: "Microsoft Outlook" }).first();
    await expect(outlookCard.getByText("Not configured — set OAuth credentials in the environment")).toBeVisible();
    await expect(outlookCard.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  test("a healthy connected Gmail account shows its status, health banner, and sync history", async ({ page }) => {
    runFixtureCommand("seed-healthy-gmail");

    await page.goto("/settings/email");
    const gmailCard = page.locator('[data-slot="card"]').filter({ hasText: "Gmail" }).first();

    await expect(gmailCard.getByText("Connected", { exact: true })).toBeVisible();
    await expect(gmailCard.getByText("e2e-fixture@tattava-demo.bank")).toBeVisible();
    await expect(gmailCard.getByText("Healthy — syncing normally.")).toBeVisible();
    await expect(gmailCard.getByText("SYNC-E2E-FIXTURE-001")).toBeVisible();
    await expect(gmailCard.getByText("42 processed, 9 relevant")).toBeVisible();
    await expect(gmailCard.getByRole("button", { name: "Sync Now" })).toBeEnabled();
  });

  test("an account needing reauthorization shows the action-required banner, the connection error, and a Reconnect link", async ({
    page,
  }) => {
    runFixtureCommand("seed-reauth-outlook");

    await page.goto("/settings/email");
    const outlookCard = page.locator('[data-slot="card"]').filter({ hasText: "Microsoft Outlook" }).first();

    await expect(outlookCard.getByText("Needs reauthorization")).toBeVisible();
    await expect(outlookCard.getByText("Action required — this mailbox hasn't synced successfully recently.")).toBeVisible();
    await expect(outlookCard.getByText("The refresh token was revoked. Reconnect this mailbox to resume syncing.")).toBeVisible();

    const reconnectLink = outlookCard.getByRole("link", { name: "Reconnect" });
    await expect(reconnectLink).toBeVisible();
    await expect(reconnectLink).toHaveAttribute("href", "/api/email/oauth/microsoft/start");

    await expect(outlookCard.getByRole("button", { name: "Sync Now" })).toBeDisabled();
  });

  test("disconnecting a mailbox clears its credentials and updates the UI in place", async ({ page }) => {
    // Depends on the "healthy connected Gmail account" test above having
    // already seeded test-e2e-settings-gmail — test.describe.serial
    // guarantees that ordering.
    await page.goto("/settings/email");
    const gmailCard = page.locator('[data-slot="card"]').filter({ hasText: "Gmail" }).first();

    await gmailCard.getByRole("button", { name: "Disconnect" }).click();
    await expect(gmailCard.getByText("Disconnect this mailbox?")).toBeVisible();
    await gmailCard.getByRole("button", { name: "Confirm" }).click();

    await expect(gmailCard.getByText("Disconnected", { exact: true })).toBeVisible();
    await expect(gmailCard.getByRole("button", { name: "Disconnect" })).not.toBeVisible();

    runFixtureCommand("verify-gmail-disconnected");
  });
});
