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
| ORM | Prisma 7 (`prisma-client` generator) + `@prisma/adapter-pg` | schema is the durable source of truth even though Demo Mode doesn't connect to it yet |
| Database | PostgreSQL | production target |
| Auth | Auth.js (NextAuth v5) | Google + Microsoft Entra ID (Azure AD) providers |
| Validation | Zod | server action / route handler input validation |

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
2. **Demo Mode ships without a live Postgres.** No database is provisioned
   in this environment. Rather than block the UI, `src/lib/data/` defines
   repository interfaces (`DealRepository`, `ClientRepository`,
   `TaskRepository`, `IntelligenceRepository`, …) with an in-memory fixture
   implementation. The Prisma schema and a `prisma-repository.ts` (planned,
   documented, not yet implemented) will satisfy the same interfaces for
   production. No page imports fixtures directly.
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

## 3. Provider abstractions

### `EmailProvider`

```ts
interface EmailProvider {
  listThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]>
  getThread(accountId: string, threadId: string): Promise<EmailThreadDetail>
  getAttachment(accountId: string, attachmentId: string): Promise<Buffer>
  watch(accountId: string): Promise<WatchHandle> // push notifications where supported
}
```

Implementations: `GmailProvider` (Gmail API, OAuth via Google), `OutlookProvider`
(Microsoft Graph API, OAuth via Entra ID). Selected per `EmailAccount.provider`
at runtime by a factory (`getEmailProvider(account)`), so a third provider is
a new class + one factory branch. **Status: interfaces + factory scaffolded;
network calls are stubbed and clearly marked `// PLANNED INTEGRATION` — no
real Gmail/Graph credentials exist in this environment.**

### `AIProvider`

```ts
interface AIProvider {
  classifyRelevance(email: EmailInput): Promise<RelevanceResult>
  extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult>
  matchDeal(extraction: ExtractionResult, candidates: DealCandidate[]): Promise<DealMatchResult>
}
```

Implementations: `AnthropicProvider`, `OpenAIProvider`, both behind
`getAIProvider()` reading `AI_PROVIDER` env var. **Status: interfaces
scaffolded with typed contracts matching `AI_EXTRACTION_SPEC.md`; no model
calls are wired in this stage** — Demo Mode's Intelligence Feed uses
pre-computed fixture output that has the identical shape the real pipeline
would produce, so swapping in a live provider changes zero UI code.

## 4. Directory layout

```
prisma/
  schema.prisma            # production DB model (see DATABASE_SCHEMA.md)
src/
  app/                      # App Router routes
    (app)/                  # authenticated shell: sidebar + topbar layout
      dashboard/
      deals/[dealId]/
      clients/[clientId]/
      intelligence/
      tasks/
      pipeline/
      calendar/
      search/
      settings/ integrations/ audit-log/
    api/                    # route handlers (webhooks, health)
  components/
    ui/                     # shadcn primitives
    layout/                 # sidebar, topbar, shell
    dashboard/ deals/ clients/ intelligence/ tasks/  # feature components
  lib/
    data/                   # repository interfaces + demo (fixture) impl
    ai/                     # AIProvider interface + implementations
    email/                  # EmailProvider interface + implementations
    auth/                   # Auth.js config, RBAC helpers
    format.ts               # currency/date formatting helpers
  types/                    # shared domain types mirrored from Prisma
```

## 5. Security boundaries

See `SECURITY.md` for the full model; architecturally: every repository
method takes an `organizationId` and every query is scoped by it, so
cross-tenant leakage requires an explicit bypass rather than an omission.

## 6. Testing & verification gates

Before any stage is marked done: `npm run lint`, `npx tsc --noEmit`,
`npm run build`. Prisma schema is checked with `prisma validate` +
`prisma generate` (no live DB required for either).
