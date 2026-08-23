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
   traceable to source evidence with a confidence score.
6. **Tasks** — board (To Do / In Progress / Completed / Dismissed) of
   AI-generated and manually created tasks with owner, priority, due date,
   source email, confidence.
7. **Calendar**, **Search**, **Settings / Integrations / Audit Log** —
   scaffolded navigation targets; Search and Calendar ship with working
   basic implementations in v1, natural-language search is a documented
   planned extension.

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

## 8. Email intelligence pipeline (summary — full detail in `AI_EXTRACTION_SPEC.md`)

```
Email → Ingestion → Thread Reconstruction → Relevance Classification →
IB Entity Extraction → Deal Matching → Change Detection → Confidence
Scoring → Human Review (where required) → Database Update → Intelligence
Feed
```

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

## 11. Demo Mode

Before any real Gmail/Outlook connection, the full UI and workflow run
against a realistic fictional dataset: six example deals (Project Falcon,
Atlas, Orion, Phoenix, Everest, Apollo), their clients, emails, tasks,
timeline events, and intelligence-feed items. See `ARCHITECTURE.md` for how
Demo Mode plugs into the same interfaces the live system will use.

## 12. Non-goals for v1

- Real Gmail/Microsoft Graph ingestion (interfaces are built and documented
  as a **planned integration**; no live OAuth credentials exist in this
  environment).
- Natural-language semantic search (keyword search ships now; the search
  layer is architected so NL search can be added without a rewrite).
- Admin-configurable workflow editor UI (the data model supports it; the
  editor screen is a documented follow-up).
