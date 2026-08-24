# Tattava — Architecture

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) | Server Components by default |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) | see `DESIGN_SYSTEM.md` |
| Icons | lucide-react | |
| Charts | Recharts | portfolio value, stage funnels, sparklines |
| Motion | Framer Motion | used sparingly — feed item entry, panel transitions |
| Backend | Next.js Route Handlers + Server Actions | co-located with the frontend; see §2 for why FastAPI was not chosen |
| ORM | Prisma 7 (`prisma-client` generator) + `@prisma/adapter-pg` | schema is the durable source of truth; **live in Phase 1** — see §2.7 |
| Database | PostgreSQL | live and seeded in this environment |
| Auth | Auth.js (NextAuth v5) | Credentials-based demo login **live**; Google + Microsoft Entra ID planned |
| Drag-and-drop | `@dnd-kit/core` | Pipeline board (deal stage) and Task board (status) |
| Validation | Zod | server action / route handler input validation; also validates every AI extraction (§3) |
| Email intelligence | `src/lib/pipeline/` | modular pipeline, **live** against `DemoEmailProvider` — see `PHASE3_EMAIL_INTELLIGENCE.md` |
| Testing | Vitest (unit + DB integration) + Playwright (`@playwright/test`, e2e smoke) | see §6 |

## 2. Decision log

Decisions made directly per the build brief ("make reasonable engineering
decisions yourself and document them"):

1. **Next.js API routes/Server Actions over FastAPI.** The brief allows
   either, preferring FastAPI "where useful." A single TypeScript codebase
   keeps the AI extraction pipeline, Prisma schema, and UI in one type-safe
   surface for a v1 built by one engineer/agent. If a future stage needs a
   long-running Python worker (e.g. a heavier NLP pipeline), it can be
   introduced as a separate service behind the same `AIProvider` interface
   without touching the frontend.
2. **Repository interface first, two implementations.** `src/lib/data/`
   defines repository interfaces (`DealRepository`, `ClientRepository`,
   `TaskRepository`, `IntelligenceRepository`, `DashboardRepository`,
   `ReferenceRepository`, `AuditLogRepository`, `NotificationRepository`) in
   `types.ts`. Phase 0 shipped only `demo-repository.ts` (in-memory
   fixtures) because no database was provisioned; Phase 1 provisions a real
   Postgres and adds `prisma-repository.ts`, which `src/lib/data/index.ts`
   now exports as the active implementation. `demo-repository.ts` stays in
   the codebase — it's the seed script's source data (`prisma/seed.ts`
   imports the same fixtures directly) and a reference implementation of
   the interfaces — but no page reads from it at runtime. No page imports
   fixtures directly either way; everything goes through `./index`.
3. **Money as integer minor units.** All monetary fields are `BigInt`
   minor-unit integers (e.g. cents) plus an ISO currency code, never
   floating point, to avoid rounding artifacts on deal values in the
   hundreds of millions.
4. **Deal stages modeled as data, not enum.** Because stage workflows are
   service-specific and must be admin-editable later, stages are rows
   (`DealWorkflow` → `DealStageDefinition`) referenced by `Deal.stageId`,
   not a hardcoded enum switch.
5. **Auth provider callbacks route through an `AuthorizationProvider`
   boundary** so RBAC/org-isolation logic is testable independent of
   NextAuth's session shape.
6. **AI extraction runs server-side only.** Nothing in `AI_EXTRACTION_SPEC.md`
   or the provider abstraction is reachable from client bundles; API keys
   never leave the server.
7. **Phase 1 "Authentication" is a Credentials demo login, not real OAuth.**
   The execution brief's flow diagram opens with "Authentication →
   Dashboard" but explicitly defers Gmail/Microsoft OAuth to a later phase.
   `src/lib/auth/config.ts` adds a `Credentials` provider ("continue as
   {banker}") backed by seeded `User` rows, JWT session strategy, gated by
   `src/proxy.ts` (Next 16's renamed `middleware.ts` — note it lives under
   `src/`, sibling to `src/app`, matching this project's `src/` layout).
   Real Google/Microsoft OAuth providers stay configured in the same file
   for when credentials exist; nothing about the Credentials provider
   blocks wiring them in later.
8. **`IntelligenceEvent` is a first-class table, not a computed view.** The
   Intelligence Feed / dashboard "Today's Intelligence" needs persisted
   `reviewStatus` (Mark reviewed / Dismiss) and a stable id per item, so
   `prisma/schema.prisma` has a dedicated `IntelligenceEvent` model
   (category, dealId?, clientId?, headline, delta, confidence,
   sourceEmailId?, reviewStatus) rather than deriving feed rows on the fly
   from `DealEvent`/`Task`/`Opportunity` at read time. `DealEvent` remains
   the deal timeline's source of truth; `IntelligenceEvent` is the
   AI-surfaced-signal source of truth — the two overlap in content for
   hero-narrative deals but serve different UI surfaces.
9. **`@dnd-kit/core` for Pipeline/Task board drag-and-drop.** Chosen over
   hand-rolled HTML5 drag events for accessibility (keyboard support,
   screen-reader announcements) and pointer-based touch support. Each
   `DndContext` is given an explicit `id` prop — without it, `@dnd-kit`
   generates `aria-describedby` ids from a module-level counter that isn't
   stable between SSR and the client's first render, causing a hydration
   mismatch.
10. **Search parsing lives in its own module (`search-query.ts`) apart from
    the Prisma-querying code (`search.ts`).** The parser is pure (no DB
    import) so it's unit-testable without a database connection; `search.ts`
    imports it and adds the Prisma `WHERE` construction.
11. **Every mutation is a Server Action, not a route handler**, colocated
    in `src/lib/actions/mutations.ts`, each requiring an authenticated
    session and writing an `AuditLog` row before returning. Drag-and-drop
    UIs apply an optimistic local update, call the action, then
    `router.refresh()` to reconcile with the server; on failure they revert
    to the last known-good state and show an inline error.
12. **Settings → Notifications preferences are real persisted booleans on
    `OrganizationMember`**, not a decorative form. The checkboxes are native
    Radix `Checkbox` inputs with a `name`, so the surrounding `<form
    action={updateNotificationPreferences}>` submits them via a Server
    Action with no client-side state required — consistent with decision
    #11's "Server Action, not a route handler" rule.
13. **One `AiExtraction` row per detected change, not per email.** An email
    can simultaneously carry a value change and a stage change; modeling
    them as separate extraction rows (each with its own confidence,
    evidence, and applied status) lets the AI Review Center accept one and
    reject the other independently, and keeps `acceptExtraction()`'s
    mutation path identical to whatever the pipeline's own `AUTO_APPLY`
    branch would have done.
14. **Deterministic thread-continuity override in deal matching**, not a
    second AI call. Once a thread is linked to a deal, every subsequent
    email in it is matched to that deal unless a *different*, equally
    explicit (≥95%) codename match appears — cheaper and more predictable
    than asking the AI provider to re-litigate an already-known thread on
    every message, and it's what actually prevents "Project Falcon" /
    "Falcon Acquisition" from fragmenting into two deals.
15. **The Run Scan Server Action runs synchronously to completion** rather
    than kicking off background work the response doesn't wait for. A
    Vercel serverless function isn't a durable worker, so fire-and-forget
    after `return` isn't safe there; the client-side progress UI instead
    cycles the real stage-name list (`src/lib/pipeline/stages.ts`) as a
    loading indicator while the one request is in flight, then renders the
    exact counters the action returns — never a hardcoded number.

## 3. Provider abstractions

Full pipeline architecture (stages, matching engine, confidence policy,
jobs/observability): `PHASE3_EMAIL_INTELLIGENCE.md`. Summary of the two
provider abstractions it's built on:

### `EmailProvider`

```ts
interface EmailProvider {
  getThreads(accountId, since?): Promise<EmailThreadSummary[]>
  getThread(accountId, providerThreadId): Promise<EmailThreadDetail>
  getMessages(accountId, providerThreadId): Promise<EmailMessage[]>
  getMessage(accountId, providerMessageId): Promise<EmailMessage>
  getNewMessages(accountId, since?): Promise<EmailMessage[]>
  getAttachments(accountId, providerMessageId): Promise<EmailAttachmentRef[]>
  downloadAttachment(accountId, attachmentId): Promise<Buffer>
  markProcessed(accountId, providerMessageId): Promise<void>
  watch(accountId): Promise<WatchHandle> // push notifications where supported
}
```

Implementations: `DemoEmailProvider` (**live** — every method is a real
Prisma read/write against the seeded mailbox; `getNewMessages` is what
"Run Scan" pulls from), `GmailProvider` (Gmail API, OAuth via Google),
`MicrosoftGraphProvider` (Microsoft Graph API, OAuth via Entra ID) — both
planned, throwing `PLANNED INTEGRATION` errors, no real credentials exist
in this environment. `getEmailProvider()` resolves to Demo unless
`EMAIL_PROVIDER=live`; `getEmailProviderFor(provider)` dispatches per
`EmailAccount.provider` once real accounts exist.

### `AIProvider`

```ts
interface AIProvider {
  classifyRelevance(email: EmailInput, context: ClassificationContext): Promise<RelevanceResult>
  extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult>
  matchDeal(extraction: ExtractionResult, candidates: DealCandidate[]): Promise<DealMatchResult>
}
```

Implementations: `DemoAIProvider` (live — a rule-based, no-API-key
implementation using composable extractor functions
(`src/lib/ai/extractors.ts`) for relevance, dollar amounts,
stage-transition phrases, deadlines, risk/opportunity signals; drives the
real pipeline in `src/lib/pipeline/` and is what "Run Scan" actually
calls), `AnthropicProvider`, `OpenAIProvider` (both stubbed, throw with a
`PLANNED INTEGRATION` message). All three sit behind `getAIProvider()`
reading `AI_PROVIDER` env var (default `"demo"`). Every provider's output
is validated against `ExtractionResultSchema` (Zod,
`src/lib/ai/extraction-schema.ts`) before it's written to the database.
Swapping `AnthropicProvider`/`OpenAIProvider` in for real extraction
changes zero pipeline or UI code — the Intelligence Feed already reads
`IntelligenceEvent` rows with
the identical shape either path produces.

## 4. Directory layout

```
prisma/
  schema.prisma            # production DB model (see DATABASE_SCHEMA.md)
  seed.ts                  # generates the full seeded dataset (hero + filler + backlog)
  seed/                    # seed helpers: RNG, company pool, templates, backlog.ts (Phase 3)
src/
  proxy.ts                 # Next 16 middleware — auth gate (lives under src/, not repo root)
  app/                      # App Router routes
    login/                  # Credentials demo login
    (app)/                  # authenticated shell: sidebar + topbar layout
      dashboard/
      deals/[dealId]/
      clients/[clientId]/
      intelligence/         # feed
      intelligence/review/   # AI Review Center (Phase 3)
      intelligence/scan/     # Run Scan + scan history + Email Activity (Phase 3)
      tasks/
      pipeline/
      calendar/
      search/
      settings/ integrations/ audit-log/
      loading.tsx error.tsx # shared loading/error boundaries for the whole section
    api/auth/[...nextauth]/ # NextAuth route handlers
    not-found.tsx global-error.tsx
  components/
    ui/                     # shadcn primitives
    layout/                 # sidebar, topbar, mobile-nav (drawer), notifications-menu
    dashboard/ deals/ clients/ intelligence/ tasks/ pipeline/  # feature components
  lib/
    data/                   # repository interfaces (types.ts) + prisma-repository.ts (live)
                             # + demo-repository.ts (fixtures — seed source, not active)
    actions/mutations.ts    # Server Actions: stage/status/notification/review mutations + audit log
    actions/pipeline-actions.ts # Server Actions: triggerEmailScan, accept/rejectExtraction (Phase 3)
    ai/                     # AIProvider interface, extraction-schema.ts (Zod), extractors.ts (pure
                             # helpers), confidence-policy.ts, prompts/, Demo/Anthropic/OpenAI impls
    email/                  # EmailProvider interface + Demo (live) / Gmail / MicrosoftGraph impls
    pipeline/                # the Phase 3 pipeline — see PHASE3_EMAIL_INTELLIGENCE.md §1
    auth/                   # Auth.js config (config.ts), Server Actions (actions.ts)
    search.ts search-query.ts  # DB-backed search + its pure query parser
    insights.ts             # client relationship-intelligence bullet computation
    format.ts               # currency/date formatting helpers
  types/                    # shared domain types mirrored from Prisma
tests/
  unit/                     # Vitest — pure functions (format, search-query, pipeline extraction)
  integration/               # Vitest — against the real seeded Postgres database
  e2e/                        # Playwright — full-app smoke test
```

## 5. Security boundaries

See `SECURITY.md` for the full model; architecturally: every repository
method takes an `organizationId` and every query is scoped by it, so
cross-tenant leakage requires an explicit bypass rather than an omission.
`src/proxy.ts` gates every route except `/login` and `/api/auth/*` behind a
session.

## 6. Testing & verification gates

Before any stage is marked done: `npm run lint`, `npx tsc --noEmit`,
`npm test` (Vitest unit + database integration tests — requires
`DATABASE_URL` and a seeded database), `npm run test:e2e` (Playwright
smoke test — requires the dev server and a seeded database), `npm run
build`. Prisma schema is checked with `prisma validate` + `prisma
generate` (no live DB required for either).
