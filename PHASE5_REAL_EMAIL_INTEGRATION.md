# Tattava — Phase 5: Real Email Integration (Gmail + Microsoft 365)

This is the **live** doc for real mailbox ingestion. It documents what
actually ships in this codebase — real OAuth, real Gmail/Graph REST
clients, a real per-account sync engine, a real Settings → Email UI, real
tests against synthetic fixtures — and states plainly what has never been
exercised against a live mailbox in this sandboxed environment, and what's
deliberately deferred to Phase 5B. `CLAUDE.md` and `ARCHITECTURE.md` point
here; `PHASE3_EMAIL_INTELLIGENCE.md` and `PHASE4_DEAL_INTELLIGENCE.md`
remain the source of truth for the pipeline and intelligence layer this
phase feeds — **neither was rebuilt**.

## 0. Scope decision

The build brief was explicit: reuse the existing `EmailProvider`
abstraction, add real Gmail/Microsoft 365 ingestion behind it, and stop —
**do not** rebuild Phase 3's classification/extraction/matching pipeline,
Phase 4's Deal Intelligence engines, or Phase 4.5's trust/UX layer.
"Provider differences end at normalization." That constraint shaped every
decision below: the only genuinely new *logic* this phase adds is (1) real
provider clients that produce the same `EmailMessage` shape
`DemoEmailProvider` already does, and (2) a sync engine whose only new
responsibility is turning a freshly fetched `EmailMessage` into a real
`EmailThread`/`Email` row — after which it hands off to the literal,
unmodified `processSingleEmail()` Phase 3 already had. Everything
downstream of ingestion (classification, extraction, matching, Phase 4's
Risk/Inactivity/Valuation/Deadline engines, Phase 4.5's trust layer) is
untouched.

**Explicit prerequisite, addressed first:** the Phase 4.5 review flagged
that `src/lib/data/prisma-repository.ts`'s read layer didn't consistently
enforce organization scoping. Real mailbox content is confidential
banking correspondence — that gap had to close before this phase could
add a second organization-scoped data source. See §6.

**Branch note.** This phase's implementation was originally built on a
dedicated branch (`claude/tattava-phase5-real-email`) per an earlier
instruction to open a PR rather than push directly. This session's actual
operating instructions designate `claude/tattava-platform-build-ski1ai` —
the same branch every prior phase shipped on — as the branch to develop
and push to, with an explicit rule against pushing elsewhere without
permission. All Phase 5 work (still uncommitted at that point) was carried
onto `claude/tattava-platform-build-ski1ai` and lands there, consistent
with Phases 1–4.5. No PR was opened. If a PR-gated review is actually
wanted, that's a one-line ask away — the work is already scoped as one
clean diff.

## 1. Security model (built first, deliberately)

Every design choice here follows one rule: **a real mailbox is
confidential IB information.** Concretely:

- **Org scoping fix (prerequisite).** Every read path in
  `prisma-repository.ts` (`Deal`, `Client`, `Task`, `IntelligenceEvent`,
  the dashboard aggregate, `AuditLog`, banker reference data) now scopes to
  `DEMO_ORG_ID` — `.get(id)` uses `findFirst({ where: { id,
  organizationId } })`, never a bare `findUnique({ where: { id } })`. One
  gap in `src/lib/search.ts`'s email search (no direct `organizationId` on
  `Email` — reached via `thread.emailAccount.organizationId`) was fixed the
  same way. `Sector` reference data stays unscoped — confirmed globally
  shared, no `organizationId` column exists on it.
- **Token encryption at rest.** `src/lib/email/token-crypto.ts` —
  AES-256-GCM, a random IV per encryption, an auth tag for tamper
  detection, key from `EMAIL_TOKEN_ENCRYPTION_KEY` (must decode to exactly
  32 bytes). Stored format is `iv.authTag.ciphertext`, all base64url. The
  same primitive (a generic "encrypt this string" function, not
  token-specific) also encrypts the OAuth state cookie.
- **Tokens never reach the client.** `accessTokenEncrypted` /
  `refreshTokenEncrypted` are plain `String?` columns read only by
  server-side provider code and Server Actions; nothing in
  `src/components/` or any Client Component ever imports them. Settings →
  Email's `ConnectionStatus` shape (`connected`, `needsReauth`,
  `emailAddress`, timestamps, `error`) is explicitly the only thing exposed
  to the browser.
- **OAuth CSRF + state binding.** `src/lib/email/oauth-state.ts` — the
  state cookie is itself AES-256-GCM encrypted (so it can't be forged or
  read client-side) and binds `nonce` + `userId` + `organizationId` +
  `provider` + `createdAt`. The callback route
  (`src/app/api/email/oauth/[provider]/callback/route.ts`) rejects on any
  mismatch — missing/tampered cookie, expired (10-minute window), nonce
  mismatch, wrong user, wrong provider — with a named error code, never a
  raw exception.
- **Account-linking / cross-user mailbox attachment guard.** Before
  persisting a token exchange, the callback checks whether that
  `(provider, providerAccountId)` pair is already attached to a *different*
  Tattava user or organization; if so, the connection is rejected
  (`account_already_connected`) rather than silently reattaching someone
  else's mailbox. `@@unique([provider, providerAccountId])` on
  `EmailAccount` enforces the same invariant at the DB level.
- **Error normalization.** Every provider failure maps to a named
  `EmailProviderErrorCode` (`AUTH_REQUIRED`, `AUTH_EXPIRED`,
  `AUTH_REVOKED`, `PERMISSION_DENIED`, `RATE_LIMITED`,
  `PROVIDER_UNAVAILABLE`, `MAILBOX_NOT_FOUND`, `SYNC_FAILED`,
  `UNKNOWN_PROVIDER_ERROR`) via each provider's `handleProviderError()`.
  Settings → Email and the sync engine only ever branch on `.code` — no
  raw provider stack trace or error string reaches the UI.
- **Minimum scope, read-only.** Gmail: `gmail.readonly` only. Microsoft:
  `offline_access Mail.Read` only. Neither requests send, delete, modify,
  contacts, calendar, or file access.

**Known, pre-existing gap this phase did not introduce or fix** (in scope
for Phase 5B, not Phase 5A): the demo NextAuth session
(`src/lib/auth/config.ts`) carries only `user.id`, never
`organizationId` — every org-scoped query in the codebase (Phases 1–5
alike) uses the static `DEMO_ORG_ID` constant rather than a session-derived
organization. This is architecturally documented, not hidden (see
`ARCHITECTURE.md`'s decision log) — a real multi-org deployment needs
session-derived org resolution before this constant can be removed.

## 2. Normalized email model & `EmailProvider` interface

`src/lib/email/types.ts` — `EmailMessage` carries every field a real
provider can supply that Phase 3's pipeline can use: `provider`,
`providerMessageId`, `providerThreadId`, `internetMessageId`, sender,
recipients/cc/bcc, `replyTo`/`inReplyTo`/`references` (RFC 5322 threading),
subject, `bodyText` (clean, sent to AI) / `bodyHtml` (raw, evidence-viewer
only) / `snippet`, `sentAt`/`receivedAt`, `attachments` (metadata refs),
`labels`, `isRead`/`isDraft`.

`EmailProvider` gained, beyond the Phase 3 surface
(`getThreads`/`getThread`/`getMessages`/`getMessage`/`getNewMessages`/
`getAttachments`/`downloadAttachment`/`markProcessed`/`watch`):
`disconnect`, `getConnectionStatus`, `refreshAuthentication`,
`handleProviderError`, `initialSync`, `incrementalSync`. A separate
`OAuthEmailProvider` interface (`getAuthorizationUrl`,
`exchangeCodeForTokens`) exists because `DemoEmailProvider` has no OAuth
concept at all — its one account is pre-seeded, never "connected."

`DemoEmailProvider` implements the full extended interface too (its new
methods delegate sensibly to what already existed), so the interface
change alone required updating it — proof the abstraction is real, not
just typed to look that way.

## 3. Real providers

`src/lib/email/gmail-provider.ts` and `microsoft-graph-provider.ts` — real
REST clients (`fetch()` directly, not the `googleapis`/
`@microsoft/microsoft-graph-client` SDKs — deliberate, to avoid new heavy
dependencies and keep request/response shapes visible) against the
documented Gmail API v1 and Microsoft Graph v1.0 surfaces:

- OAuth authorization URL + code exchange + refresh-token flow, each
  storing tokens encrypted via §1's primitive.
- `initialSync`/`incrementalSync` bounded to `initialSyncWindowDays`
  (30/90/180/365, default 90 — never an unlimited historical scan),
  paginated (Gmail `pageToken`, Graph `@odata.nextLink`), resumable
  (`nextCursor` persisted to `EmailProcessingJob.resumeCursor`), and — once
  a page fully drains — steady-state cursor (Gmail `historyId`, Graph
  `@odata.deltaLink`) persisted to `EmailAccount.syncCursor` for the next
  incremental sync.
- Incremental sync via the provider's own native mechanism (Gmail History
  API, Graph delta query), falling back to a bounded 7-day re-list if the
  stored cursor has expired (Gmail returns 404 for an unknown `historyId`;
  Graph returns 410 for an expired delta link — both explicitly handled).
- Exponential backoff on 429/5xx (`fetchWithRetry`, 3 retries, doubling
  from 500ms; Microsoft Graph additionally honors `Retry-After`).
- MIME parsing for Gmail (base64url parts, recursive walk, `text/plain` /
  `text/html` extraction, quoted-reply/signature stripping via
  `stripQuotedAndSignature`); Graph returns structured JSON bodies
  directly, so no MIME parsing is needed there — `htmlToText` handles
  Graph's `contentType: "html"` case.
- Exclusion filtering before anything is fetched: Gmail via query operators
  (`-in:spam -in:trash -in:drafts -category:promotions -category:social`);
  Graph via folder scope (`/mailFolders/inbox/messages` — Sent, Drafts,
  Deleted, Junk are separate folders this never queries).
- Attachments: **metadata only** (`id`, `filename`, `mimeType`,
  `sizeBytes`) — `downloadAttachment()` throws on both providers; Phase 5A
  never fetches attachment content (spec-mandated).
- `watch()` throws `UNKNOWN_PROVIDER_ERROR` on both — push
  notifications/webhooks are Phase 5B (§8).

**Honest caveat:** these clients are built and typed against the real,
documented API contracts, but this sandboxed environment has no outbound
network access to Google/Microsoft and no registered OAuth app credentials
— **neither provider has ever completed a live OAuth handshake or synced a
real mailbox in this environment.** What's actually verified: correctness
against the documented API shapes, full type-checking, and behavior
against a mocked provider in `tests/integration/phase5-sync-engine.test.ts`
(see §7). Live verification is the human owner's first step (§9).

## 4. OAuth routes

- `GET /api/email/oauth/[provider]/start` — session check, mints the
  encrypted state cookie (§1), redirects to the provider's consent screen.
  Deliberately separate from NextAuth's own Google/Microsoft sign-in
  providers (`src/lib/auth/config.ts`) — same OAuth app, different scope,
  different purpose (authorizing mailbox *read access*, not authenticating
  *identity*), different storage (`EmailAccount`, not a session).
- `GET /api/email/oauth/[provider]/callback` — every check in §1, then
  creates or updates the `EmailAccount` row (encrypted tokens,
  `scopesGranted`, `connectionStatus: CONNECTED`) and writes an `AuditLog`
  entry (`Email account connected` / `reconnected`), then redirects to
  `/settings/email?connected=1&account=<id>`.

## 5. Sync engine

`src/lib/email/sync-engine.ts` — `runAccountSync(accountId,
triggeredById?)`, the real counterpart to `orchestrator.ts`'s `runScan()`
for one connected mailbox:

1. **Single-flight guard** — `EmailAccount.activeSyncJobId` (a unique FK
   to the in-flight `EmailProcessingJob`); a second call while one is
   `RUNNING` throws `SyncAlreadyRunningError` rather than racing.
2. **Sync type** — `INITIAL` until `EmailAccount.initialSyncCompleted`
   flips `true` (only once a page returns `hasMore: false`), then
   `INCREMENTAL` forever after.
3. **Bounded per invocation** — up to `MAX_PAGES_PER_INVOCATION` (5) pages
   per call, so one "Sync Now" click can't run past a serverless function's
   timeout. `hasMore`/`resumeCursor` persist so the *next* click picks up
   exactly where the last one stopped — this is Vercel-compatible
   processing without a background worker, per the build brief's explicit
   constraint (no permanent workers this pass; see §8 for what's deferred).
4. **Ingestion, not a second pipeline** — for each fetched message: upsert
   `EmailThread` (dedup key: `[emailAccountId, providerThreadId]`), then
   upsert `Email` (dedup key: `[threadId, providerMessageId]`) — if the
   `Email` row already existed, the message is counted as
   `messagesSkipped` and processing stops there for it. Attachment
   metadata is persisted as `EmailAttachment` rows with
   `storageRef: "not-downloaded:<providerAttachmentId>"` — an explicit
   sentinel, never a real object reference, matching §3's metadata-only
   constraint.
5. **Genuinely new messages only** are handed to the exported
   `processSingleEmail()`/`log()`/`setStage()` from
   `src/lib/pipeline/orchestrator.ts` — the exact same functions
   `runScan()`'s loop calls, made reusable via one `export` keyword each,
   zero logic duplicated or reimplemented.
6. **Same Phase 4 org-wide passes** (`runInactivityScan`,
   `runDeadlineScan`) run once per sync, exactly as `runScan()` already
   does at the end of a Demo Mode scan — the only "tick" this environment
   has without a scheduler (§8), so it runs on every sync, not only when
   new mail arrived.
7. **Provider error handling** — `AUTH_EXPIRED`/`AUTH_REVOKED`/
   `AUTH_REQUIRED` flip `EmailAccount.connectionStatus` to `NEEDS_REAUTH`;
   any failure sets `connectionError` and fails the job, always releasing
   the single-flight guard in the process (never leaves an account stuck
   "syncing forever").
8. **Audit logging** on both success and failure.

**A real bug this phase found and fixed in existing (Phase 3) code:**
`runScan()`'s account lookup was an unqualified `db.emailAccount.findFirst({
where: { organizationId } })` — safe when an org could only ever have one
`EmailAccount` row, which stopped being true the moment Settings → Email
lets a banker connect a real mailbox alongside the seeded Demo Mode one.
Left as-is, connecting a real mailbox would have silently broken "Run
Scan" (a `findFirst` with no ordering could resolve to the *real* account,
and `DemoEmailProvider.getNewMessages()` filters by `thread.emailAccountId`
— the seeded 200+-email backlog is threaded under the demo account's id
specifically, so the wrong account resolves to zero messages). Fixed by
scoping the lookup to `providerAccountId: null` — set only on the seeded
Demo Mode account, never on a real OAuth connection — pinning Run Scan to
the account it has always meant, independent of whatever else gets
connected. Verified live: Run Scan still processes the full 91-email
backlog correctly after the fix (Playwright-verified, not just asserted).

## 6. Settings → Email

`/settings/email` (`src/app/(app)/settings/email/page.tsx`) — real
connection cards per provider, backed by live `EmailAccount` rows
(`providerAccountId IS NOT NULL` — the seeded Demo Mode account is
deliberately excluded from this UI; see §5's bug note for why that
distinction matters). Each connected card shows: connection status
(`Connected` / `Needs reauthorization` / `Disconnected`), last synced /
last successful sync, initial sync progress, a real Sync Now button wired
to `syncEmailAccountAction()` (`src/lib/actions/email-actions.ts` →
`runAccountSync()`), an initial-sync-window selector (locked once the
first sync completes), a Disconnect flow with confirmation, and real sync
history (`EmailProcessingJob` rows: displayId, INITIAL/INCREMENTAL,
processed/relevant counts, timestamp, or the error if it failed). An
explicit "Tattava will / will NOT" panel states the permission contract in
plain language before any Connect click. `/integrations` — previously a
static "planned integration" placeholder — now points into this page
rather than duplicating its state.

Every Server Action in `src/lib/actions/email-actions.ts`
(`syncEmailAccountAction`, `disconnectEmailAccountAction`,
`setInitialSyncWindowAction`) re-derives the `EmailAccount` from the
database scoped to `DEMO_ORG_ID` before acting — the id a browser form
posts back is never trusted alone, the same rule §1 enforces everywhere
else.

## 7. Testing

**Explicit constraint honored throughout: no real confidential banking
email appears anywhere in this test suite** — every fixture below is
invented specifically for these tests.

- `tests/fixtures/phase5-golden-emails.ts` — 55 synthetic scenarios: 20
  normal deal correspondence, 5 stage changes (one per
  `detectStageSignal` transition), 5 valuation changes (confirmed,
  non-hedged, ≥90% confidence), 5 deadlines (calibrated against a fixed
  reference date), 5 risks (one per `RISK_PHRASES` category), 5
  opportunities (one per `OPPORTUNITY_PHRASES` category), 5 irrelevant, 5
  ambiguous (context-dependent — the same content classifies differently
  depending on thread linkage / known-client context, directly exercising
  `DemoAIProvider`'s own documented behavior). Every scenario's expected
  output was verified against the real, deterministic
  classifier/extractor before being locked into an assertion — not
  guessed.
- `tests/unit/phase5-golden-emails.test.ts` — the golden set exercised
  against `classifyRelevance`/`extractEntities`/`detectStageSignal`/
  `detectMoneySignal`/`parseDeadline`/`detectRiskSignals`/
  `detectOpportunitySignal`, plus the required golden tests: **positive
  valuation-change** (confirms extraction + `AUTO_APPLY`), **false-positive
  protection** (a market-commentary dollar figure with no deal/client
  anchor never resolves `matchDeal` to `EXISTING_DEAL`), **forwarded-email
  quote stripping** (a stale, quoted dollar figure inside an
  Outlook-style `-----Original Message-----` block is stripped by
  `normalizeBody` before extraction ever sees it), and
  **signature/disclaimer non-interpretation** (a standard confidentiality
  footer appended to a real signal doesn't change the extracted result).
- `tests/integration/phase5-sync-engine.test.ts` — `runAccountSync()`
  exercised against a hand-built fake `EmailProvider` (never a real
  network call): dedup holds at 1/2/5/10 repeated syncs of the identical
  message (exactly one `Email` row throughout), a genuinely distinct
  forwarded message (different `providerMessageId`, same thread) is
  correctly *not* deduped away, attachment metadata persists with the
  `not-downloaded:` sentinel and `downloadAttachment` is never called, and
  the single-flight guard rejects a second sync while one is `RUNNING`.
- `tests/integration/phase5-security-and-valuation.test.ts` — cross-
  organization isolation proven for every entity type the security review
  named: `EmailAccount`, `EmailThread`, `Email` (all previously untested
  at this layer), `Risk`, `Briefing`, `AuditLog`, `DealValuationObservation`
  (scoped via `dealId → Deal.organizationId`, no `organizationId` column of
  its own), `AiExtractionEvidence`/Evidence (scoped via
  `extraction → email → thread → emailAccount.organizationId`), plus a
  direct regression test on `prismaDealRepository.get()` /
  `prismaClientRepository.get()` — the actual functions §1's fix touched,
  not just the query pattern in isolation. The same file's second describe
  block is the **end-to-end positive valuation-change golden test**: a
  golden email, matched to a real fixture deal by project codename through
  the real `matchClient`/`matchDeal`/`applyDealChanges` stages, produces a
  real `DealEvent`, `DealValuationObservation`, and `IntelligenceEvent`,
  with the deal's `enterpriseValueMinorUnits` actually updated.

**A real, pre-existing classifier finding surfaced while building this
dataset** (not a Phase 5 regression — `DemoAIProvider`'s keyword matching
predates this phase and was deliberately not touched, per the "don't
rebuild Phase 3" constraint): `scoreTermHits`'s substring matching means
both "Monday" and "Sunday" contain the literal substring `"nda"`, which
collides with the `"nda"` banking term — either weekday name alone can
tip an otherwise entirely unrelated email into `POSSIBLY_RELEVANT`. Worth
knowing if a real Gmail/Graph sync produces an unexpected
`POSSIBLY_RELEVANT` classification on ordinary correspondence that happens
to mention a Monday or Sunday.

**Verification gate, run repeatedly through this phase, all green:**
`npm run lint`, `npx tsc --noEmit`, `npx vitest run` (147/147 passing,
confirmed idempotent across repeated runs against the same seeded
database — see the note below on shared-database test hygiene), `npm run
build`. `npx playwright test` was not re-run at the end of this phase
(no UI-affecting change since the last green run recorded in
`PHASE4_5_PRODUCTION_HARDENING.md`) beyond the manual Playwright
screenshot verification of `/settings/email` and a live `/intelligence/
scan` Run Scan click described in §5.

**Shared-database test hygiene note.** This sandbox's test suite runs
against one real seeded Postgres database, not an ephemeral one per test
file. Any test that writes into `DEMO_ORG_ID` and doesn't clean up every
side effect (including org-wide passes like inactivity/deadline scans, not
just its own fixture rows) can shift another test's assertions elsewhere
in the suite — this was hit twice while building this phase (once from a
manual "Run Scan" click during UI verification, once from an earlier draft
of the sync-engine tests that used `DEMO_ORG_ID` directly) and fixed both
times by giving the offending tests their own dedicated test-only
organization instead, then reseeding (`npx tsx prisma/seed.ts`) to clear
the accumulated pollution. Every Phase 5 integration test now follows the
established self-contained-fixture convention strictly: its own
organization where the test doesn't specifically need `DEMO_ORG_ID`, never
relying on `prisma/seed.ts`'s mutable global state.

## 8. Deferred to Phase 5B

Stated plainly, not silently dropped:

- **Push notifications / webhooks** (Gmail `watch()`, Graph change
  subscriptions) — `watch()` throws on both providers today. Real-time
  sync stays poll-based (a Vercel Cron scheduler as of Phase 5B, or
  manual "Sync Now"), not a live push.
- ~~A scheduler.~~ **Shipped in Phase 5B** — a Vercel Cron job now calls
  `runAccountSync()` automatically per connected account; see
  `PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md`.
- **Attachment content download.** Phase 5A is metadata-only by design
  (spec-mandated); actually fetching and storing attachment bytes,
  including a storage backend decision (S3-compatible object storage,
  presumably), is a Phase 5B feature.
- **A second OAuth app for mailbox-connect vs. sign-in**, if ever wanted —
  today both reuse the same `GOOGLE_CLIENT_ID`/`MICROSOFT_CLIENT_ID`
  registrations at different scopes (see `.env.example`'s note).
- **Live verification against a real mailbox.** Everything in §3 is typed
  and logically correct against the documented API contracts and passes
  against synthetic/mocked tests, but genuinely has never run against a
  live Gmail or Microsoft 365 account — see §9 for exactly what that first
  connection requires.
- **The pre-existing session→organization gap** noted in §1 — real
  multi-tenant deployment needs this resolved; Phase 5 works around it the
  same way every prior phase did (`DEMO_ORG_ID`), consistent with, not a
  regression from, the rest of the codebase.

## 9. Connecting the first real test mailbox

1. Register an OAuth app: Google Cloud Console (Gmail API enabled, OAuth
   consent screen configured, scope `gmail.readonly`) or Azure AD app
   registration (Microsoft Graph, delegated permission `Mail.Read` +
   `offline_access`).
2. Add both redirect URIs to the app registration: the existing NextAuth
   callback (`/api/auth/callback/{google,azure-ad}`) and the new
   mailbox-connect callback (`/api/email/oauth/{gmail,microsoft}/callback`)
   — both under your deployment's actual origin.
3. Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` or
   `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_TENANT_ID` in
   the deployment's environment (see `.env.example`).
4. Generate and set `EMAIL_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64
   32`) — required before any Connect click will succeed.
5. Migrations apply automatically on deploy — `package.json`'s `build`
   script is `prisma migrate deploy && next build`, so a normal Vercel
   deployment applies any pending migration before building. Nothing extra
   to run by hand. (This was added after a real incident: a Vercel
   deployment whose Postgres `DATABASE_URL` env var was marked
   "Sensitive" — which Vercel makes permanently unretrievable, even via
   `vercel env pull` — made a manual `prisma migrate deploy` from a local
   machine impossible, since there was no way to get the connection string
   back out. Running the migration inside the build, where Vercel injects
   the real env var value regardless of its dashboard visibility, sidesteps
   that entirely and fixes it for every future migration too, not just
   this one.)
6. Sign in, go to Settings → Email, click Connect on Gmail or Microsoft
   365, complete the real consent screen.
7. On return (`?connected=1`), click **Sync Now**. Watch the sync history
   entry: it should show a real `messagesFetched`/processed count, not
   zero — if it shows an error, the `EmailProviderErrorCode` in the job's
   error message names exactly what failed (auth, permission, rate limit,
   etc.).
8. Once real, banking-relevant mail has synced, check `/intelligence` (What
   Changed) for real events, and `/intelligence/review` for anything
   sitting at 70–89% confidence — click through an event's evidence to
   confirm it traces back to the actual source email, not a summary.
