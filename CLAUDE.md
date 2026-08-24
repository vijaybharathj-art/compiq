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
| `AI_EXTRACTION_SPEC.md` | Email intelligence pipeline, confidence policy, prompts |
| `SECURITY.md` | Auth, data isolation, secrets, RBAC, audit policy |
| `DESIGN_SYSTEM.md` | Visual language, tokens, component conventions |

## Stack summary

- Next.js (App Router, TypeScript, Turbopack) + Tailwind CSS v4 + shadcn/ui
- Prisma ORM 7 (PostgreSQL via `@prisma/adapter-pg` driver adapter) — **the
  live database is the active runtime** (see below), schema is the
  production source of truth
- Auth.js (NextAuth v5) — a Credentials-based demo login is live today
  (`src/lib/auth/config.ts`); Google + Microsoft Entra ID OAuth are
  scaffolded and planned (SECURITY.md §1)
- `@dnd-kit/core` — Pipeline and Tasks board drag-and-drop
- `EmailProvider` abstraction — `GmailProvider` / `OutlookProvider` (planned)
- `AIProvider` abstraction — `DemoExtractionProvider` (live, rule-based,
  used by the seed script) / Anthropic / OpenAI (planned)

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
