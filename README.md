# Tattava

AI-native investment banking deal intelligence and workflow platform. Tattava
turns fragmented deal-team email communication into a structured, continuously
updated view of deals, clients, stages, values, teams, tasks, risks, and
origination opportunities.

Start with `CLAUDE.md` — it maps the rest of the documentation
(`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`,
`AI_EXTRACTION_SPEC.md`, `PHASE3_EMAIL_INTELLIGENCE.md`, `SECURITY.md`,
`DESIGN_SYSTEM.md`), which together are the persistent source of truth for
this project.

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
companies, 25 deals, 202 emails (112 pre-processed history + a ~90-email
unprocessed backlog), tasks, and intelligence events. Click **Run Scan**
(Intelligence → Scan) to watch the real email intelligence pipeline process
that backlog — classification, extraction, deal matching, change detection,
and task/risk/opportunity generation all genuinely execute (see
`PHASE3_EMAIL_INTELLIGENCE.md`). Re-running the seed script resets
everything, including the scan backlog, to a pristine state.

## Stack

Next.js 16 (App Router, TypeScript, Turbopack) · Tailwind CSS v4 · shadcn/ui
· Prisma 7 + PostgreSQL (live) · Auth.js (Credentials demo login live;
Google + Microsoft Entra ID OAuth planned) · `@dnd-kit/core` ·
`EmailProvider`/`AIProvider` abstractions (`DemoEmailProvider`/
`DemoAIProvider` live; Gmail, Microsoft Graph, Anthropic, OpenAI planned) ·
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
environment variables there, and run the migrate + seed commands above
against the production database before first use (see `DATABASE_SCHEMA.md`
"Reproducing the database").
