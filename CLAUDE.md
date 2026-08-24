# CLAUDE.md — Tattava Engineering Guide

This file orients any engineer (human or AI) picking up work on Tattava. It
is the entry point; the other root-level docs are the persistent source of
truth for their respective domains.

## What is Tattava

Tattava is an AI-native Investment Banking Deal Intelligence & Workflow
Platform. It turns a banker's inbox into a live, continuously updated view
of deals, clients, stages, tasks, deadlines, risks, and origination
opportunities. See `PRODUCT_SPEC.md` for the full product definition.

**Not** a generic CRM. **Not** a generic ERP. Purpose-built for investment
banking workflows.

## Document map

| Doc | Purpose |
|---|---|
| `PRODUCT_SPEC.md` | Product vision, UX requirements, feature scope |
| `ARCHITECTURE.md` | Tech stack, module boundaries, provider abstractions, decision log |
| `DATABASE_SCHEMA.md` | Entity-relationship reference for `prisma/schema.prisma` |
| `AI_EXTRACTION_SPEC.md` | Email intelligence pipeline spec, confidence policy, prompts |
| `PHASE3_EMAIL_INTELLIGENCE.md` | The **live** email-to-deal-intelligence pipeline — modules, provider abstractions, matching engine, jobs/observability |
| `PHASE4_DEAL_INTELLIGENCE.md` | The **live** Deal Intelligence layer — importance scoring, Risk/Inactivity/Valuation/Deadline/Momentum engines, Briefing engine, What Changed?, Client Attention |
| `PHASE4_5_PRODUCTION_HARDENING.md` | The **live** trust layer, intelligence-first dashboard/UX polish, organization-isolation audit, AI-failure resilience — what shipped vs. deferred |
| `PHASE5_REAL_EMAIL_INTEGRATION.md` | The **live** real Gmail + Microsoft 365 mailbox integration — OAuth, token security, the sync engine, Settings → Email — what shipped vs. Phase 5B |
| `SECURITY.md` | Auth, data isolation, secrets, RBAC, audit policy |
| `DESIGN_SYSTEM.md` | Visual language, tokens, component conventions |

## Stack summary

- Next.js (App Router, TypeScript, Turbopack) + Tailwind CSS v4 + shadcn/ui
- Prisma ORM 7 (PostgreSQL via `@prisma/adapter-pg` driver adapter) — **the
  live database is the active runtime** (see below), schema is the
  production source of truth
- Auth.js (NextAuth v5) — a Credentials-based demo login is live today
  (`src/lib/auth/config.ts`); Google + Microsoft Entra ID OAuth *sign-in*
  are scaffolded and planned (SECURITY.md §1) — separate from the
  mailbox-connect OAuth flow below, which is live
- `@dnd-kit/core` — Pipeline and Tasks board drag-and-drop
- `EmailProvider` abstraction (`src/lib/email/`) — `DemoEmailProvider`
  (live, backed by the seeded mailbox) / `GmailProvider` /
  `MicrosoftGraphProvider` (live, real OAuth + REST clients — see
  `PHASE5_REAL_EMAIL_INTEGRATION.md`; never live-tested against a real
  mailbox in this sandboxed environment)
- `AIProvider` abstraction (`src/lib/ai/`) — `DemoAIProvider` (live,
  rule-based, drives the real email intelligence pipeline) / Anthropic /
  OpenAI (planned) — see `PHASE3_EMAIL_INTELLIGENCE.md`
- Zod — validates every AI extraction against a strict schema before it's
  ever written to the database (`src/lib/ai/extraction-schema.ts`)

## Phase 1: Postgres is the live runtime

A real PostgreSQL database is provisioned and seeded — `src/lib/data/`
(`prisma-repository.ts`) is the active repository implementation behind
`src/lib/data/index.ts`, backed by `prisma/schema.prisma` and populated by
`prisma/seed.ts` (10 clients, 20 companies, 25 deals, 100+ emails, 50+
intelligence events, 40+ tasks, 100+ timeline events — mixing hand-curated
"hero" deals with programmatically generated volume). `src/lib/data/
demo-repository.ts` (in-memory fixtures) remains in the codebase as the
seed's source data and as a reference implementation of the same
interfaces (`src/lib/data/types.ts`) — it is not the active runtime.

**Local setup**: start Postgres, then run
`npx prisma migrate dev && npx tsx prisma/seed.ts` (or `npm run db:seed`
once migrated). See `.env.example` for `DATABASE_URL`. The dev database in
this sandbox is ephemeral (container-local) — recreate the role/database
per `ARCHITECTURE.md` if the container restarts.

Mutations (deal stage drag-and-drop, task status drag-and-drop, Intelligence
Feed review actions, notification read state) go through Server Actions in
`src/lib/actions/mutations.ts`, each writing an `AuditLog` row.

## Phase 3: the email intelligence pipeline is live

`src/lib/pipeline/` implements the full email-to-deal-intelligence pipeline
described in `PHASE3_EMAIL_INTELLIGENCE.md` — classification, extraction,
client/deal matching, change detection, confidence-gated auto-apply vs.
human review, task/meeting/risk/opportunity generation — run for real
against `DemoEmailProvider`'s seeded mailbox backlog, not a UI that
pretends processing happened. **Run Scan** (`/intelligence/scan`) triggers
it via `triggerEmailScan()` (`src/lib/actions/pipeline-actions.ts`);
**AI Review** (`/intelligence/review`) is where 70–89%-confidence
suggestions wait for Accept/Reject. `prisma/seed.ts` seeds 202 emails
total — ~112 pre-processed history plus a ~90-email unprocessed backlog
that Run Scan actually works through.

## Phase 4: the Deal Intelligence layer is live

`src/lib/intelligence/` implements the full Deal Intelligence layer
described in `PHASE4_DEAL_INTELLIGENCE.md` on top of Phase 3's pipeline —
a deterministic, documented 0-100 `importanceScore` on every
`IntelligenceEvent` (never AI-computed), a Deal Risk Engine, an Inactivity
Engine (business-day-aware, stage-position-aware), Stage and Valuation
Intelligence, Deadline Intelligence with overdue escalation, a Task
Recommendation Engine, a Client Attention Engine, and a Deal Momentum
Score kept explicitly distinct from risk. **What Changed?**
(`/intelligence`, rewritten) is the primary intelligence experience;
**Morning/Evening Briefings** (`/intelligence/morning`,
`/intelligence/evening`) are generated (manually, via a button — no
scheduler yet) from real DB events through a structured pipeline and
stored, never regenerated on every read, with every material statement
traceable back to a real `IntelligenceEvent` via `Briefing.sourceEventIds`.
The AI provider only ever narrates already-assembled facts
(`AIProvider.summarizeBriefing()`) — it never invents a fact or
recomputes a number that gets rendered directly.

## Phase 4.5: production hardening & banker UX

`PHASE4_5_PRODUCTION_HARDENING.md` documents the trust layer
(`TrustBadge`/`WhyAmISeeingThis`/`WhyThisMatters`/`IntelligenceLabelChip`,
`src/components/shared/`) now standardized across What Changed, the
dashboard's Top Priorities, Deal Detail, and the Task board; the
intelligence-first dashboard (`src/app/(app)/dashboard/page.tsx`, no
generic CRM stat grid); an organization-isolation audit and fixes across
every Server Action in `src/lib/actions/`; AI-narration failure isolation
in the Briefing Engine (a failed `summarizeBriefing()` call never takes
the underlying structured data down with it); and Run Scan's
server-enforced "no duplicate jobs" guarantee. It also states plainly
what's deferred — a standalone Data Quality Center, a model-evaluation
program, and a known remaining gap in the Phase 1 read-repository layer's
organization scoping — rather than claiming a full 89-section spec was
completed in one pass.

## Phase 5: real email integration is live

`PHASE5_REAL_EMAIL_INTEGRATION.md` documents real Gmail + Microsoft 365
mailbox ingestion behind the existing `EmailProvider` abstraction — real
OAuth (`src/app/api/email/oauth/[provider]/{start,callback}`), encrypted
token storage (`src/lib/email/token-crypto.ts`), real REST clients for
both providers, and a new per-account sync engine
(`src/lib/email/sync-engine.ts`, `runAccountSync()`) that ingests and
dedupes real messages, then hands genuinely new ones to Phase 3's
unmodified `processSingleEmail()` — there is still exactly one
intelligence pipeline. **Settings → Email** (`/settings/email`) is where a
banker connects a mailbox, watches sync history, and disconnects.
Real email is bounded (30/90/180/365-day initial sync window, default 90,
never unlimited), resumable, single-flight-guarded per account, and
metadata-only for attachments in this phase. The doc also states plainly
what's Phase 5B — push notifications/webhooks, a scheduler, attachment
content download — and the one honest caveat that matters most: none of
the real-provider code has ever completed a live OAuth handshake or synced
a real mailbox in this sandboxed environment (no outbound network access,
no registered OAuth app credentials here); what's verified is correctness
against the documented API contracts plus a full synthetic/mocked test
suite (`tests/fixtures/phase5-golden-emails.ts`,
`tests/integration/phase5-sync-engine.test.ts`).

## Working conventions

- **Next.js 16**: this project targets Next 16, not Next 14/15 idioms.
  `params`/`searchParams` in Server Components are `Promise`s and must be
  awaited. Turbopack is the default bundler. Read
  `node_modules/next/dist/docs/` when in doubt — training data on Next.js
  predates this major version.
- **Prisma 7**: generator is `prisma-client` (not `prisma-client-js`),
  output is `src/generated/prisma`, and the client requires an explicit
  driver adapter (`@prisma/adapter-pg`) — there is no implicit engine
  binary. Config lives in `prisma.config.ts`, not `package.json`.
- Server Components by default; `"use client"` only where interactivity is
  required (filters, dialogs, charts, forms).
- No giant page files — extract feature components under
  `src/components/<domain>/`.
- No hardcoded fictional data inside page/component files — it lives in
  `src/lib/data/fixtures/` only.
- Every list page handles loading, empty, error, and populated states —
  `src/app/(app)/loading.tsx` and `error.tsx` cover the whole authenticated
  section; `src/app/not-found.tsx` covers missing deals/clients.
- Money values are stored as integer minor units (cents) with a currency
  code — never floats. Prisma stores them as `BigInt`; repositories convert
  to `number` at the boundary (safe — well under `Number.MAX_SAFE_INTEGER`
  for realistic deal sizes) since React Server Component payloads can't
  serialize `BigInt`.
- Run `npm run lint`, `npx tsc --noEmit`, `npm test` (Vitest — unit +
  database integration tests), `npm run test:e2e` (Playwright smoke test),
  and `npm run build` before considering any stage complete.

## Engineering decisions made without asking

Per the build brief, reversible/non-architectural calls were made directly
and documented in `ARCHITECTURE.md`'s decision log instead of blocking on
approval. Anything that would change the product, data model, or security
model fundamentally is flagged separately.
