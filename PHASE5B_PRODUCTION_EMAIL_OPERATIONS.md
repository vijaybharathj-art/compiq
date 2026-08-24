# Tattava — Phase 5B: Production Email Operations

Phase 5 (`PHASE5_REAL_EMAIL_INTEGRATION.md`) built real Gmail + Microsoft
365 ingestion behind the `EmailProvider` abstraction, but left every sync
banker-triggered ("Sync Now") and left its one biggest caveat unresolved:
none of it had ever run against a real mailbox anywhere. Phase 5B closes
the operational gap — automatic scheduled sync, bounded per-message retry,
and visible sync health — and, separately and for the first time, a real
Gmail account was actually connected and synced against a real production
deployment during this phase. Both threads are documented here, kept
honestly distinct: what shipped as code in this repository, and what was
separately, manually verified live by a human against Vercel production.

**Rule Zero**: nothing in Phase 5's contracts changed. `runAccountSync()`,
`GmailProvider`, `MicrosoftGraphProvider`, the `EmailProvider` interface,
the OAuth connect/callback routes, and Phase 3's `processSingleEmail()`
are exactly as Phase 5 left them. Every Phase 5B addition is either new
code calling those contracts unchanged (the scheduler) or a narrowly
targeted fix to a bug Phase 5B's own changes made reachable (the sync-job
id race — see §3).

## 1. What's new

- A Vercel Cron-triggered scheduler that calls `runAccountSync()`
  automatically, on an interval, per connected account — Phase 5 had no
  scheduler at all; every sync required a banker to click **Sync Now**.
- A bounded retry for messages that fail extraction, instead of a
  permanently stuck mailbox.
- A fix for a real concurrency bug the scheduler's own bounded-parallel
  syncing made reachable.
- A plain-language sync health status, next-scheduled-sync time, and
  richer sync history in Settings → Email.
- Expanded test coverage: cron auth-boundary tests, scheduler tests, retry
  tests, and Playwright E2E coverage for Settings → Email.
- A real, live, human-verified Gmail connection and sync against
  production — see §6.

## 2. The scheduler

`src/lib/email/scheduler.ts` — `runScheduledSyncs()` — reused unchanged
from Phase 5:

```
db.emailAccount.findMany({
  where: { connectionStatus: "CONNECTED", providerAccountId: { not: null } },
})
```

This is deliberately organization-unscoped, the same shape as Phase 5's
`EmailAccount.providerAccountId IS NULL` distinction
(`ARCHITECTURE.md` item #25) — the scheduler's job is "every real,
connected mailbox across the whole deployment," not one organization's.
For each eligible account:

- Skipped (`skipped_recent`) if `lastSyncedAt` is newer than
  `EMAIL_SYNC_INTERVAL_MINUTES` ago (default 15) — this is a floor
  independent of the Cron schedule itself, so tightening `vercel.json`'s
  cron cadence later can't cause an account to be synced more often than
  this without also raising the floor.
- Skipped (`skipped_running`) if `runAccountSync()` throws
  `SyncAlreadyRunningError` — Phase 5's single-flight guard
  (`EmailAccount.activeSyncJobId`) already prevented two syncs racing on
  one account; the scheduler just needs to not treat that as a failure.
  A `NEEDS_REAUTH` account is never eligible in the first place (excluded
  by the query's `connectionStatus` filter) — no runaway retry against
  credentials that are already known-invalid (spec Part 20/45).
- Synced in bounded batches of up to 3 accounts concurrently
  (`Promise.all`, chunked) — enough parallelism to matter, bounded enough
  not to hammer either provider's API or this process's own connection
  pool.
- Any other failure is caught per-account and recorded (`failed`) — one
  account's exception never aborts the batch.

`/api/cron/email-sync` (`src/app/api/cron/email-sync/route.ts`) is the
route Vercel Cron calls. It authenticates via
`Authorization: Bearer <CRON_SECRET>` and refuses to run at all (HTTP 500)
if `CRON_SECRET` isn't configured — it never falls back to "allow
unauthenticated." `src/proxy.ts` excludes `/api/cron` from the session
gate for the same reason `/api/auth` is excluded: it authenticates itself
by a different mechanism than a user session (a real bug caught during
this phase by actually curling the route rather than assuming code review
alone was sufficient — before the fix, every cron call 307-redirected to
`/login` and never ran).

`vercel.json` schedules it hourly (`0 * * * *`):

```json
{
  "crons": [{ "path": "/api/cron/email-sync", "schedule": "0 * * * *" }]
}
```

Hourly, not the tighter 15–30 minute cadence a live-mail product would
eventually want, was chosen as a conservative default safe on Vercel's
Hobby tier — this sandbox has no way to verify Vercel's current exact
cron-frequency limits per plan without web access, so the schedule errs
conservative rather than assert a number that might be wrong. Tightening
it later is a one-line change to `vercel.json`, safe regardless of
`EMAIL_SYNC_INTERVAL_MINUTES`'s own floor (see above).

## 3. Sync engine hardening

**Bounded per-message retry** (`Email.processingAttempts`, migration
`20260825010000_phase5b_processing_attempts`): before this field existed,
a message that failed Phase 3 extraction stayed `PROCESSING_FAILED`
forever — its `Email` row already existed, so the sync loop's dedup check
treated it as "already handled" and never looked at it again on a later
sync. Now `ingestMessage()` computes a separate `shouldProcess` signal:
a `PROCESSING_FAILED` message is retried on the next sync while
`processingAttempts < MAX_PROCESSING_ATTEMPTS` (3), then left alone —
retried, not retried forever. `tests/integration/phase5b-retry.test.ts`
proves both halves: the retry-then-cap sequence, and that a message
which succeeds after a prior failure is marked `PROCESSED` and never
touched again.

**A real concurrency race, found and fixed**: the old
`nextSyncDisplayId()` helper counted existing `EmailProcessingJob` rows
and created a new one with `count + 1` — correct as long as nothing ever
called it concurrently, which nothing did before Phase 5B's scheduler
introduced `Promise.all`-based concurrent `runAccountSync()` calls.
Running the new scheduler tests alongside Phase 5's existing integration
tests surfaced a real `PrismaClientKnownRequestError` (`P2002`, unique
constraint on `displayId`) — not a test-fixture artifact, a genuine
TOCTOU bug the new code made reachable. Fixed by `createSyncJob()`
(`src/lib/email/sync-engine.ts`), which retries job creation past a
`P2002` past up to `MAX_DISPLAY_ID_RETRIES` (5) times, recomputing the id
each attempt, rather than introducing a lock or changing the id scheme.

## 4. Settings → Email: sync health & observability

`src/app/(app)/settings/email/page.tsx` computes a per-account `health`
status server-side:

| health | meaning |
|---|---|
| `HEALTHY` | connected, and the last successful sync was within `STALE_SYNC_HOURS` (24) |
| `ACTION_REQUIRED` | `NEEDS_REAUTH`, or connected but no successful sync in over 24h — the "provider silently stopped returning new mail without ever tripping an auth error" case, which `connectionStatus` alone can't catch |
| `NEVER_SYNCED` | connected, initial sync hasn't run yet — the existing initial-sync-window prompt already covers this state, so no separate banner |
| `DISCONNECTED` | no banner — nothing actionable |

`EmailAccountCard` (`src/components/settings/email-account-card.tsx`)
renders this as a plain-language banner, plus a "Next scheduled sync"
fact computed from `lastSyncedAt + EMAIL_SYNC_INTERVAL_MINUTES` whenever
the scheduler is configured (`CRON_SECRET` set) and the account is
connected with a prior sync — `null` (rendering "Not scheduled — use Sync
Now") otherwise, deliberately never approximated from the current render
moment (an earlier draft called `Date.now()` as a fallback inside the
Server Component's render body, which ESLint's `react-hooks/purity` rule
correctly rejects — removed rather than suppressed).

## 5. Testing

All new tests use a mocked `EmailProvider` (`vi.fn()`-backed, following
Phase 5's own pattern) or mock `processSingleEmail`/`getEmailProviderFor`
directly — never a real network call, never real mail, matching Phase 5's
existing convention: **no real OAuth credentials are ever used in
tests.**

- `tests/unit/cron-email-sync.test.ts` (4 tests) — the auth boundary:
  missing `CRON_SECRET` (500, never falls back to allow), missing header,
  wrong secret, malformed header (all 401).
- `tests/integration/phase5b-scheduler.test.ts` (6 tests) —
  `minSyncIntervalMinutes()`'s env-var parsing/fallback, and
  `runScheduledSyncs()` against real `EmailAccount`/`EmailProcessingJob`
  fixtures in the database: due-vs-recent skip logic, `skipped_running`
  on a racing single-flight guard, and `NEEDS_REAUTH` exclusion. Its
  assertions check specific fixture accounts' outcomes
  (`summary.results.find(r => r.accountId === ...)`) rather than global
  `summary.accountsEligible`/etc. counts — the scheduler's query is
  deliberately organization-unscoped (§2), so an exact global count would
  be fragile against other integration test files' simultaneously-live
  fixture accounts under Vitest's default parallel file execution. This
  was a real, reproduced failure during this phase (not a hypothetical) —
  fixed by rewriting the assertions, confirmed by running this file
  alongside `phase5-sync-engine.test.ts` and `phase5b-retry.test.ts`
  together, twice, cleanly.
- `tests/integration/phase5b-retry.test.ts` (2 tests) — the retry-then-cap
  sequence and the succeeds-after-failure sequence described in §3.
- `tests/e2e/settings-email.spec.ts` (4 Playwright tests) — Connect UI
  disabled/"not configured" state, a healthy connected account's status/
  health banner/sync history, a `NEEDS_REAUTH` account's action-required
  banner/error message/Reconnect link, and disconnecting a mailbox
  (verified both in the UI and directly against the database). Fixtures
  are seeded via `tests/e2e/fixtures/settings-email-fixtures.ts`, run
  through `tsx` rather than imported directly in the spec file — the
  Prisma 7 generated client is ESM-only (uses `import.meta`), which
  Playwright's own CommonJS-based TS transform can't load, unlike
  Vitest's Vite-based one. **Deliberately never clicks "Sync Now" against
  a real account** — that Server Action calls the real
  `GmailProvider`/`MicrosoftGraphProvider`, which would attempt a live
  OAuth token refresh; this sandbox has no real OAuth app credentials to
  make that succeed or fail deterministically. That specific path (a real
  sync actually executing) is covered by the mocked integration suites
  above and, separately, by the live human verification in §6 — never by
  this E2E file.
- Full verification gate note: this phase's own E2E run includes Phase 1's
  pre-existing `Run Scan` smoke test, which really executes Phase 3's
  pipeline against the seeded backlog and permanently mutates the
  database (emails flip to `PROCESSED`, new `IntelligenceEvent` rows are
  created). Running the full Playwright suite and then the full Vitest
  suite against the same persistent local database, without reseeding in
  between, made one pre-existing Phase 4 test
  (`deal-intelligence.test.ts` Test 1) fail — not a Phase 5B regression;
  reseeding before each suite (the documented, existing convention) made
  it pass cleanly, twice. Recorded here because it cost real time to
  diagnose and is worth not re-diagnosing next time.

## 6. Google Cloud + Vercel configuration, and what was actually verified live

This section documents the real values and real steps used against the
user's actual deployment, `https://compiq-sand.vercel.app` (Vercel team
`alpha-brief`, project `compiq`) — not invented placeholders.

### 6.1 Google Cloud Console (Gmail)

1. Create (or reuse) a Google Cloud project, enable the Gmail API.
2. Configure the OAuth consent screen ("Google Auth Platform" in the
   current console UI). While the app is in **Testing** publish status,
   sign-in is restricted to explicitly listed test users — add every
   Gmail address that needs to connect under the **Audience** tab (this
   replaced the old "OAuth consent screen → Test users" location; a real
   `Error 403: access_denied` was hit and fixed this exact way during
   this phase when the console UI had moved and the test-user list was
   initially empty).
3. Create an OAuth 2.0 Client ID (Web application). Add **both** redirect
   URIs the app can send Google to, under the real deployment origin:
   - `https://compiq-sand.vercel.app/api/auth/callback/google` (NextAuth
     sign-in — planned, not yet enabled, but harmless to register now)
   - `https://compiq-sand.vercel.app/api/email/oauth/gmail/callback`
     (the mailbox-connect callback — `src/app/api/email/oauth/[provider]/
     callback/route.ts`; the exact path the app actually constructs at
     runtime, `new URL('/api/email/oauth/gmail/callback', req.url)`, in
     `src/app/api/email/oauth/[provider]/start/route.ts`)
4. Copy the generated Client ID and Client Secret into Vercel's
   environment variables (§6.2) as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.

The equivalent Microsoft path (Azure AD app registration, Graph
`Mail.Read` + `offline_access` delegated permissions, redirect URI
`https://compiq-sand.vercel.app/api/email/oauth/microsoft/callback`) was
not exercised live this phase — only Gmail was. It follows the identical
shape (`PHASE5_REAL_EMAIL_INTEGRATION.md` §9), untested claims are not
made about it here.

### 6.2 Vercel environment variables

Set under the project's Environment Variables (Production, and Preview if
used):

- `DATABASE_URL` — the production Postgres connection string. **Do not
  mark this "Sensitive."** A real incident this session: a "Sensitive"
  `DATABASE_URL` is permanently unretrievable, even via
  `vercel env pull` (the pulled file literally contains
  `DATABASE_URL="[SENSITIVE]"`), which blocked ever running
  `prisma migrate deploy` by hand again. `package.json`'s build script
  (`"prisma migrate deploy && next build"`, `ARCHITECTURE.md` item #27)
  works around this specific incident regardless of the variable's
  visibility setting, but avoiding "Sensitive" for `DATABASE_URL` in the
  first place avoids the whole class of problem.
- `AUTH_SECRET`, `AUTH_URL` — NextAuth; Vercel auto-trusts its own host,
  so `AUTH_URL` matches the real deployment origin.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from §6.1.
- `EMAIL_TOKEN_ENCRYPTION_KEY` — `openssl rand -base64 32`, run once
  locally or in any shell; this is a symmetric key, not a credential
  issued by Google or Microsoft, so it's generated, not obtained from a
  console.
- `CRON_SECRET` — Phase 5B, new. Any high-entropy random string (e.g.
  `openssl rand -hex 32`); Vercel Cron sends it verbatim as the bearer
  token on every scheduled call. Enabling Vercel Cron itself requires no
  separate toggle beyond `vercel.json` existing in the deployed
  repository and the account being on a plan Vercel Cron is available on.
- `EMAIL_SYNC_INTERVAL_MINUTES` — optional, defaults to 15 if unset.

### 6.3 What was actually confirmed live this phase

A real Gmail account (the user's own) was connected end-to-end against
the real `compiq-sand.vercel.app` deployment:

1. Google Cloud OAuth client created, redirect URIs registered as above.
2. Vercel env vars set; two real production bugs were hit and fixed along
   the way (both already documented — `ARCHITECTURE.md` item #27 for the
   "Sensitive" `DATABASE_URL` / missing-migration crash, and the
   `Audience` tab test-user step above for the `access_denied` error).
3. Settings → Email → Connect → real Google consent screen → redirected
   back with `?connected=1`.
4. **Sync Now** was run for real: the sync history showed a real,
   non-placeholder result — 120 messages fetched, 24 relevant — against
   the user's actual mailbox.
5. The "What Changed?" feed was checked, and correctly distinguished from
   the app's seeded fictional demo dataset (Project Falcon/Nomad/Beacon)
   which still renders on that same page by design (Demo Mode's own
   intelligence events, unrelated to any connected mailbox) — the ground
   truth for "did my sync do anything" is Settings → Email's own sync
   history, not the shared, importance-ranked What Changed feed, which
   mixes both sources with no visual separation today. That's a real,
   still-open UX gap (a banker with both Demo Mode data and a real
   mailbox connected has no way to filter one from the other in What
   Changed) — worth fixing, not fixed this phase.

This is the first time any part of the Phase 5 code path has been
confirmed working against a real mailbox and a real deployment. It was
not performed from inside this sandbox (no outbound network access, no
registered OAuth credentials here) — it was performed by the user,
directly, against their own production Vercel deployment, and reported
back into this conversation with screenshots and CLI output at each step.

### 6.4 What is still honestly unverified

- **Microsoft/Outlook**, end to end — never connected live by anyone,
  this phase or Phase 5.
- **The scheduler's actual Cron-triggered invocation in production** —
  `vercel.json` is deployed and the route's auth boundary is verified by
  direct `curl` against a local dev server (`tests/unit/
  cron-email-sync.test.ts` codifies the same boundary), but no one has
  observed Vercel's own Cron infrastructure actually calling
  `/api/cron/email-sync` on schedule in production. That requires either
  waiting an hour after deploy and checking Vercel's Cron logs, or
  manually curling the production endpoint with the real `CRON_SECRET`
  — neither was done as part of this phase.
- **A large real mailbox** (thousands of messages, multi-page
  pagination under real rate limits) — the one real sync performed
  (§6.3) was 120 messages, well within a single page. Gmail/Graph
  429-handling and exponential backoff exist in the provider code
  (`gmail-provider.ts`/`microsoft-graph-provider.ts`, unchanged from
  Phase 5) and are exercised by the mocked test suite, but have never
  been exercised by an actual sustained real rate-limit response.
- **AI cost-control metrics** — not built this phase. The only live AI
  provider today is `DemoAIProvider` (rule-based, no per-call cost); the
  `AnthropicProvider`/`OpenAIProvider` stubs that would make a cost
  metric meaningful are still unimplemented (`src/lib/ai/`,
  `PHASE3_EMAIL_INTELLIGENCE.md`). Building a cost dashboard ahead of a
  real metered provider would be measuring nothing — deferred honestly
  rather than built as a placeholder.
- **Load/stress testing** of concurrent scheduler runs against many real
  accounts — the bounded-concurrency logic (§2) and the id-race fix (§3)
  are proven by targeted tests and by the concurrency bug they actually
  caught, not by a large-scale synthetic load test.

## 7. Deferred beyond Phase 5B

Unchanged from Phase 5's own deferred list (`PHASE5_REAL_EMAIL_INTEGRATION.md`
§8), still true:

- Push notifications / webhooks (Gmail `watch()`, Graph change
  subscriptions) — sync is still poll-based (scheduled or manual), never
  push.
- Attachment content download — still metadata-only.
- A second OAuth app for mailbox-connect vs. sign-in.
- The pre-existing session→organization gap (`DEMO_ORG_ID` workaround).

Plus, new from this phase: a real Anthropic/OpenAI `AIProvider`
implementation (§6.4's AI cost-control point depends on this existing
first), a UX fix distinguishing Demo Mode intelligence events from a
connected real mailbox's events in the shared What Changed feed (§6.3),
and live verification of everything in §6.4.
