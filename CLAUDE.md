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
- Prisma ORM 7 (PostgreSQL via `@prisma/adapter-pg` driver adapter) — schema
  is the production source of truth; **Demo Mode ships without a live
  database** (see below)
- Auth.js (NextAuth v5) — Google + Microsoft Entra ID OAuth
- `EmailProvider` abstraction — `GmailProvider` / `OutlookProvider`
- `AIProvider` abstraction — Anthropic / OpenAI implementations

## Demo Mode is the default runtime today

There is no provisioned Postgres instance in this environment. Rather than
block the whole UI on database infrastructure, the app runs against an
**in-memory demo data layer** (`src/lib/data/`) that implements the exact
same repository interfaces the Prisma-backed implementation will use
(`src/lib/data/types.ts`). Swapping demo mode for live data later means
writing one new file (`src/lib/data/prisma-repository.ts`) — no page or
component code should change. Never let page/component code import demo
fixtures directly; always go through `src/lib/data/index.ts`.

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
- Every list page handles loading, empty, error, and populated states.
- Money values are stored as integer minor units (cents) with a currency
  code — never floats.
- Run `npm run lint` and `npx tsc --noEmit` and `npm run build` before
  considering any stage complete.

## Engineering decisions made without asking

Per the build brief, reversible/non-architectural calls were made directly
and documented in `ARCHITECTURE.md`'s decision log instead of blocking on
approval. Anything that would change the product, data model, or security
model fundamentally is flagged separately.
