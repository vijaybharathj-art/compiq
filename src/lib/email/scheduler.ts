import { getPrismaClient } from "@/lib/db";
import { runAccountSync, SyncAlreadyRunningError } from "./sync-engine";

// Automatic incremental sync (PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §24) —
// the scheduled counterpart to a banker manually clicking "Sync Now"
// (src/lib/actions/email-actions.ts). Deliberately thin: this module's only
// job is picking *which* accounts are due and calling the exact same
// runAccountSync() a manual click uses — no separate sync logic, no
// second pipeline. Triggered by a Vercel Cron job hitting
// src/app/api/cron/email-sync/route.ts, since this project has no
// persistent background worker (Vercel-compatible constraint carried over
// from Phase 5 — see PHASE5_REAL_EMAIL_INTEGRATION.md's decision log).

const DEFAULT_MIN_INTERVAL_MINUTES = 15;
// Bounded concurrency (spec Part 30) — a handful of accounts sync at once
// rather than the whole org unboundedly, keeping this inside one
// serverless invocation's time budget as account count grows.
const MAX_CONCURRENT_ACCOUNT_SYNCS = 3;

export type ScheduledSyncOutcome = "synced" | "skipped_recent" | "skipped_running" | "failed";

export interface ScheduledSyncResult {
  accountId: string;
  emailAddress: string;
  outcome: ScheduledSyncOutcome;
  detail?: string;
}

export interface ScheduledSyncSummary {
  accountsEligible: number;
  accountsSynced: number;
  accountsSkipped: number;
  accountsFailed: number;
  results: ScheduledSyncResult[];
}

/** Configurable cadence (spec Part 24) — how long since an account's last sync before it's due again. Also the guard that stops the scheduler redundantly re-syncing an account a banker just manually clicked "Sync Now" on. */
export function minSyncIntervalMinutes(): number {
  const raw = Number(process.env.EMAIL_SYNC_INTERVAL_MINUTES ?? DEFAULT_MIN_INTERVAL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MIN_INTERVAL_MINUTES;
}

/**
 * Finds every real, connected mailbox due for a sync and runs them with
 * bounded concurrency, isolating one account's failure from the rest
 * (spec Part 31, applied at the account level the same way
 * sync-engine.ts already applies it at the per-message level).
 *
 * Scoped to `connectionStatus: CONNECTED` only — an account sitting at
 * NEEDS_REAUTH is never retried automatically (spec Part 20/45: "no
 * runaway retry" against invalid credentials); it waits for a banker to
 * reconnect. `providerAccountId: { not: null }` excludes the seeded Demo
 * Mode account the same way Settings -> Email's listing does (see
 * PHASE5_REAL_EMAIL_INTEGRATION.md §5) — the scheduler only ever touches
 * real mailboxes.
 */
export async function runScheduledSyncs(): Promise<ScheduledSyncSummary> {
  const db = getPrismaClient();
  const cutoff = new Date(Date.now() - minSyncIntervalMinutes() * 60_000);

  const accounts = await db.emailAccount.findMany({
    where: { connectionStatus: "CONNECTED", providerAccountId: { not: null } },
  });

  const summary: ScheduledSyncSummary = { accountsEligible: accounts.length, accountsSynced: 0, accountsSkipped: 0, accountsFailed: 0, results: [] };

  const due = [];
  for (const account of accounts) {
    if (account.lastSyncedAt && account.lastSyncedAt >= cutoff) {
      summary.accountsSkipped += 1;
      summary.results.push({ accountId: account.id, emailAddress: account.emailAddress, outcome: "skipped_recent" });
      continue;
    }
    due.push(account);
  }

  for (let i = 0; i < due.length; i += MAX_CONCURRENT_ACCOUNT_SYNCS) {
    const batch = due.slice(i, i + MAX_CONCURRENT_ACCOUNT_SYNCS);
    await Promise.all(
      batch.map(async (account) => {
        try {
          await runAccountSync(account.id);
          summary.accountsSynced += 1;
          summary.results.push({ accountId: account.id, emailAddress: account.emailAddress, outcome: "synced" });
        } catch (err) {
          if (err instanceof SyncAlreadyRunningError) {
            // The single-flight guard already caught a race with a
            // concurrent manual "Sync Now" (spec Part 26) — not a failure.
            summary.accountsSkipped += 1;
            summary.results.push({ accountId: account.id, emailAddress: account.emailAddress, outcome: "skipped_running" });
            return;
          }
          summary.accountsFailed += 1;
          summary.results.push({
            accountId: account.id,
            emailAddress: account.emailAddress,
            outcome: "failed",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  return summary;
}
