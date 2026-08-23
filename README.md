# Tattava

AI-native investment banking deal intelligence and workflow platform. Tattava
turns fragmented deal-team email communication into a structured, continuously
updated view of deals, clients, stages, values, teams, tasks, risks, and
origination opportunities.

Start with `CLAUDE.md` — it maps the rest of the documentation
(`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`,
`AI_EXTRACTION_SPEC.md`, `SECURITY.md`, `DESIGN_SYSTEM.md`), which together
are the persistent source of truth for this project.

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs entirely in
**Demo Mode** — a realistic fictional dataset (six sample deals, their
clients, tasks, and intelligence feed) served from an in-memory data layer.
No database, OAuth credentials, or AI provider keys are required to explore
the full UI.

## Stack

Next.js (App Router, TypeScript, Turbopack) · Tailwind CSS v4 · shadcn/ui ·
Prisma 7 (schema defined, not yet connected — see `ARCHITECTURE.md`) ·
Auth.js (Google + Microsoft OAuth, scaffolded) · Recharts · Framer Motion.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```
