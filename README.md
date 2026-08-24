# Tattava

AI-native investment banking deal intelligence and workflow platform. Tattava
turns fragmented deal-team email communication into a structured, continuously
updated view of deals, clients, stages, values, teams, tasks, risks, and
origination opportunities.

Start with `CLAUDE.md` — it maps the rest of the documentation
(`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`,
`AI_EXTRACTION_SPEC.md`, `PHASE3_EMAIL_INTELLIGENCE.md`,
`PHASE4_DEAL_INTELLIGENCE.md`, `PHASE4_5_PRODUCTION_HARDENING.md`,
`PHASE5_REAL_EMAIL_INTEGRATION.md`, `PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md`,
`SECURITY.md`, `DESIGN_SYSTEM.md`), which together are the persistent
source of truth for this project.

## Running locally

Requires a local PostgreSQL instance.

```bash
npm install
cp .env.example .env               # fill in DATABASE_URL at minimum
npx prisma migrate dev             # applies prisma/migrations/
npx tsx prisma/seed.ts             # seeds demo data (or: npm run db:seed)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and "continue as" any
seeded banker — this is a demo Credentials login, not a real password (see
`SECURITY.md` §1). The database is the live runtime: 10 clients, 20
companies, 25 deals, 203 emails (112 pre-processed history + a ~91-email
unprocessed backlog), tasks, and intelligence events. Click **Run Scan**
(Intelligence → Scan) to watch the real email intelligence pipeline process
that backlog — classification, extraction, deal matching, change detection,
and task/risk/opportunity generation all genuinely execute (see
`PHASE3_EMAIL_INTELLIGENCE.md`). Re-running the seed script resets
everything, including the scan backlog, to a pristine state.

**What Changed?** (Intelligence, the default tab) is the primary
intelligence view — a prioritized, database-driven feed ranked by a
documented 0–100 importance score, not a raw email list. **Morning
Briefing**/**Evening Briefing** generate a stored, evidence-traceable
summary from real deal events (button-triggered — no scheduler yet). The
Dashboard's Risks and Deadlines cards, each Deal's Intelligence panel
(momentum, risk, inactivity, valuation history, recommendations), and each
Client's Attention card are all backed by the same engines (see
`PHASE4_DEAL_INTELLIGENCE.md`).

## Stack

Next.js 16 (App Router, TypeScript, Turbopack) · Tailwind CSS v4 · shadcn/ui
· Prisma 7 + PostgreSQL (live) · Auth.js (Credentials demo login live;
Google + Microsoft Entra ID OAuth planned) · `@dnd-kit/core` ·
`EmailProvider`/`AIProvider` abstractions (`DemoEmailProvider`/
`DemoAIProvider` live; Gmail, Microsoft Graph, Anthropic, OpenAI planned) ·
a deterministic Deal Intelligence layer (importance scoring, Risk/
Inactivity/Valuation/Deadline/Momentum engines, stored briefings) ·
Recharts · Framer Motion.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test              # Vitest — unit + database integration tests
npm run test:e2e      # Playwright — e2e smoke test (needs a running dev server)
npm run build
```

## Deployment (Vercel)

The app is built to deploy as-is on Vercel: no filesystem persistence, no
long-running background workers (the email scan runs synchronously inside
one Server Action — see `PHASE3_EMAIL_INTELLIGENCE.md` §1/§8), and the
database is external PostgreSQL reached only through `DATABASE_URL`. See
`.env.example` for every environment variable a deployment needs; never
commit `.env`. Connect the repository in the Vercel dashboard, set the
environment variables there — **do not mark `DATABASE_URL` "Sensitive"**,
which makes it permanently unretrievable even to you (see `ARCHITECTURE.md`
item #27) — and seed the production database once before first use (see
`DATABASE_SCHEMA.md` "Reproducing the database"); migrations apply
automatically on every build (`package.json`'s `build` script runs
`prisma migrate deploy` first).

`vercel.json` also declares an hourly Vercel Cron job
(`/api/cron/email-sync`) that automatically syncs every connected real
mailbox — set `CRON_SECRET` (any high-entropy random string) for it to
run at all; it refuses to run unauthenticated. See
`PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md` §6 for the exact Google Cloud
Console / Vercel configuration steps used against this project's own
deployment.
