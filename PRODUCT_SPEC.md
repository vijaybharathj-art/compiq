# Tattava — Product Specification

## 1. Vision

Tattava turns the investment banker's inbox into a live deal intelligence
system. A banker connects a work mailbox; Tattava classifies, extracts, and
structures the investment-banking-relevant content into a continuously
updated model of deals, clients, stages, values, teams, counterparties,
tasks, deadlines, risks, and origination signals — then surfaces it through
a dense, elegant, Bloomberg/Linear-inspired dashboard.

Guiding question for every feature: **does this help a banker understand,
manage, or act on their deal flow faster?** If not, it doesn't ship.

## 2. Primary entities

Deals are the central object of the application (see `DATABASE_SCHEMA.md`
for the full field list). Around deals: Clients, Companies, Counterparties,
Deal Teams, Tasks, Documents, Meetings, Timeline Events, Opportunities, and
the Intelligence Feed that surfaces AI-detected changes.

## 3. Information architecture

**Sidebar — TATTAVA**: Dashboard, Deals, Pipeline, Clients, Tasks,
Intelligence, Calendar, Search.

**Sidebar — TEAMS** (banking service filters): M&A, ECM, DCM, Leveraged
Finance, Restructuring, Private Capital, Advisory.

**Sidebar — SYSTEM**: Settings, Integrations, Audit Log.

## 4. Core screens (build order for v1)

1. **Dashboard (Tattava Home)** — Portfolio Overview stat tiles (Active
   Deals, Total Deal Value, Deals Requiring Attention, New Opportunities,
   Deals Advanced, Deals At Risk), Today's Intelligence feed, Action
   Required task list, New Opportunities panel, Morning Briefing entry
   point.
2. **Deals** — filterable/sortable table (service, deal type, sector,
   geography, banker, stage, value, client, risk, priority, date), saved
   views, column selection, pagination.
3. **Deal Detail** — full deal object, stage progress for its service-
   specific workflow, timeline, deal team, counterparties (buyers,
   investors, lenders, lawyers, accountants), AI-detected changes with
   evidence, tasks, documents, meetings.
4. **Clients** — list + Client Intelligence detail page (relationship
   status, current/historical deals, total transaction value, contacts,
   recent communications, opportunities, banker coverage, last
   interaction).
5. **Intelligence Feed** — categorized (All / Deal Changes / Client
   Activity / Tasks / Opportunities / Risks / Important Emails), each item
   traceable to source evidence with a confidence score. **Live in Phase 1**:
   Mark reviewed / Dismiss persist `IntelligenceEvent.reviewStatus` to the
   database via a Server Action. **Live in Phase 3**: two sibling screens
   under the same Intelligence area — **AI Review** (`/intelligence/review`,
   70–89%-confidence suggestions with Accept/Reject, each opening an
   Evidence Viewer dialog onto the source email) and **Scan**
   (`/intelligence/scan`, the "Run Scan" control, scan history, and Email
   Activity) — see `PHASE3_EMAIL_INTELLIGENCE.md` §7/§9.
6. **Tasks** — board (To Do / In Progress / Completed / Dismissed) of
   AI-generated and manually created tasks with owner, priority, due date,
   source email, confidence. **Live in Phase 1**: drag-and-drop between
   columns (`@dnd-kit`) persists `Task.status` immediately, with optimistic
   UI and revert-on-failure.
7. **Calendar**, **Search**, **Settings / Integrations / Audit Log** — Search
   is **live in Phase 1**: it runs real database queries (deals, clients,
   companies, tasks, emails) and parses basic natural-language-like patterns
   (dollar amounts, stage names, risk levels, service codes) via a dedicated
   pure parser (`search-query.ts`); full semantic/NL search remains a
   documented planned extension. Calendar ships a working basic
   implementation. Settings/Integrations/Audit Log are live read screens
   backed by the database (see §11); connecting a real mailbox stays
   disabled pending OAuth credentials.

## 5. Banking services

M&A, ECM, DCM, Leveraged Finance, Restructuring, Private Capital, Financial
Advisory, Strategic Advisory, Valuation, Other.

## 6. Deal types

Buy-side M&A, Sell-side M&A, Merger, Acquisition, Divestiture, Take-private,
IPO, Follow-on, Rights Issue, Convertible, Bond Issuance, Private Placement,
Acquisition Financing, Refinancing, Leveraged Buyout, Restructuring, Joint
Venture, Strategic Investment, Other.

## 7. Deal stages (service-specific workflows)

Stages are **not** a single universal pipeline — each banking service owns
its own ordered stage list, modeled as data (`DealWorkflow` /
`DealStageDefinition` in the schema) so administrators can edit workflows
later without a code change.

- **M&A**: Origination → Initial Discussion → Pitch → Mandate → Preparation
  → Teaser → NDA → Information Memorandum → Buyer Outreach → Management
  Meetings → Indicative Bids → Final Bids → Due Diligence → Documentation →
  Signing → Closing
- **ECM**: Origination → Pitch → Mandate → Structuring → Documentation →
  Regulatory → Marketing → Bookbuilding → Pricing → Allocation → Closing
- **DCM**: Origination → Pitch → Mandate → Structuring → Rating →
  Documentation → Marketing → Pricing → Allocation → Closing
- Other services reuse a generic Origination → Pitch → Mandate → Execution →
  Closing skeleton until service-specific workflows are defined by an
  administrator.

## 8. Email intelligence pipeline (summary — full detail in `PHASE3_EMAIL_INTELLIGENCE.md`)

```
Email → Ingestion → Thread Reconstruction → Relevance Classification →
IB Entity Extraction → Deal Matching → Change Detection → Confidence
Scoring → Human Review (where required) → Database Update → Intelligence
Feed
```

**Live as of Phase 3**, driven by "Run Scan" against a seeded, unprocessed
mailbox backlog — not a simulated UI. Real Gmail/Microsoft 365 ingestion
remains a later phase (§12).

## 9. Confidence policy (never make silent high-risk changes)

For high-impact fields (deal value, deal stage, mandate status, closing
date, client, transaction type):

- **> 90%** — auto-apply if org policy permits, logged to audit trail.
- **70–90%** — create an "AI Suggested Update" awaiting Accept / Reject /
  Review.
- **< 70%** — never write to the record; surface as "Potential information
  detected" in the Intelligence Feed only.

Every AI-written field carries source evidence (originating email, sender,
timestamp, quoted excerpt) that the user can open.

## 10. Origination intelligence

Signal phrases ("strategic alternatives", "considering a sale", "evaluating
financing", "interested in acquiring", etc.) generate **Potential
Opportunity** cards, never presented as confirmed fact — always hedged
("Potential opportunity detected").

## 11. Demo Mode → Phase 1: a live seeded database → Phase 3: a live pipeline

Before any real Gmail/Outlook connection, the full UI and workflow run
against a realistic fictional dataset — but as of Phase 1 that dataset lives
in a real PostgreSQL database, not in-memory fixtures. `prisma/seed.ts`
populates it: six hand-curated "hero" deals matching the original product
narrative (Project Falcon, Atlas, Orion, Phoenix, Everest, Apollo) plus
programmatically generated "filler" deals, clients, and activity, built to
minimum volumes (10 clients, 20 companies, 25 deals, 202 emails, 50+
intelligence events, 40+ tasks, 100+ timeline events) using a seeded RNG for
reproducibility. Every page reads through the same repository interfaces
(`src/lib/data/`) that a production deployment would use — nothing is
hardcoded in a component. Sign-in is a Credentials-based "continue as
{seeded banker}" flow (see `SECURITY.md` §1), not a real credential
exchange. See `ARCHITECTURE.md` §2.2 and `DATABASE_SCHEMA.md` "Reproducing
the database" for how it plugs into the same interfaces the live system
(real OAuth + real mailbox ingestion) will use.

As of Phase 3, ~90 of those 202 emails are seeded unprocessed
(`processingStatus: PENDING`) — a genuine mailbox backlog, not just
narrative history. **Run Scan** (`/intelligence/scan`) runs the real
pipeline (`PHASE3_EMAIL_INTELLIGENCE.md`) over that backlog against
`DemoEmailProvider`, a live `EmailProvider` implementation backed by the
same Postgres tables — classification, extraction, deal matching, change
detection, and task/risk/opportunity generation all genuinely execute and
write real rows; nothing about the scan result is precomputed or
hardcoded.

## 12. Non-goals for v1

- Real Gmail/Microsoft Graph ingestion (interfaces are built and documented
  as a **planned integration**; no live OAuth credentials exist in this
  environment).
- Full semantic/NL search (a heuristic parser already recognizes deal names,
  service codes, client names, dollar amounts, stage names, and risk levels
  and queries the database live — see §4 item 7 — but true free-text
  semantic search is a documented follow-up).
- Admin-configurable workflow editor UI (the data model supports it; the
  editor screen is a documented follow-up).
