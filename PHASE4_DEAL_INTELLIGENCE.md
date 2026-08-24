# Tattava — Phase 4: Deal Intelligence Engine

Phase 3 turned raw email into structured `IntelligenceEvent`/`Task`/
`Opportunity` rows. Phase 4 turns that stream of facts into a prioritized,
explainable intelligence layer sitting on top: **What Changed?**, morning
and evening briefings, and dedicated Risk, Inactivity, Valuation, Deadline,
Momentum, Client Attention, and Task Recommendation engines. This document
is the persistent source of truth for that layer — `CLAUDE.md` links here
alongside the other root docs.

Nothing in this phase rebuilds Phase 3. Every engine below reads
`IntelligenceEvent`/`Deal`/`Task`/`DealEvent`/`Opportunity` rows the
pipeline already produces (or a few new tables purpose-built for this
phase) and adds ranking, classification, and narration on top.

## 0. Design constraint: AI narrates, rules decide (spec §67)

Every score, classification, threshold, and date computation in this phase
is a **deterministic, pure TypeScript function** — same inputs always
produce the same output, fully unit-testable with no network call. The one
`AIProvider` method Phase 4 adds, `summarizeBriefing()`, is given an
already-assembled `BriefingFacts` object and only ever narrates it in
prose ("Potential risk detected," never "the deal is at risk of failing")
— it never invents a fact, never recomputes a number that gets rendered
directly, and every material sentence in a briefing traces back to a real
`IntelligenceEvent` id (`Briefing.sourceEventIds`, verified in
`tests/integration/deal-intelligence.test.ts`).

## 1. Importance scoring (spec §5-6, §66)

`src/lib/intelligence/importance.ts` computes a 0–100 `importanceScore` on
**every** `IntelligenceEvent` at write time — never left null, never
computed by an AI call. It is the single ranking signal every other
Phase 4 surface (What Changed, briefings, notifications, recommendations)
sorts by, so there is one documented formula instead of several ad hoc
ones:

```
score = clamp(0, 100,
  ( eventTypeBase(eventType)      // 20 (CLIENT_ACTIVITY) .. 55 (STAGE_CHANGED / DEAL_VALUE_CHANGED)
  + dealMateriality(dealValue)    // 0 .. 20, by deal size bracket
  + dealPriorityBonus(priority)   // 0 .. 15, by Deal.priority
  + urgencyBonus(deadlineDaysAway)// 0 .. 20, steeper as a deadline nears/passes
  + riskBonus(riskSeverity)       // 0 .. 25, by Risk.severity
  + (requiresAction ? 10 : 0)     // event types where a banker is implicitly expected to act
  ) * confidenceMultiplier(confidencePercent)  // 0.6 .. 1.0
    * recencyMultiplier(occurredAt, now)       // 0.6 .. 1.0, decays after 24h/72h/168h
)
```

`importanceTier(score)` maps the number to `CRITICAL` (≥90) / `HIGH` (≥75)
/ `MEDIUM` (≥50) / `LOW` (≥25) / `INFORMATIONAL` — the tier badges shown in
the UI. `createIntelligenceEvent()` (`src/lib/pipeline/intelligence-events.ts`)
is the single chokepoint that computes this score (looking up the deal's
value/priority/lead banker itself) and, when the score is ≥75 and the deal
has a lead banker, creates a `Notification` (`CRITICAL` priority at ≥90,
else `HIGH`) — spec §53's "only CRITICAL/HIGH events notify."

## 2. Event deduplication (spec §47)

The same chokepoint deduplicates before insert: for event types where the
same email being reprocessed could otherwise double-write a row
(`STAGE_CHANGED`, `DEAL_VALUE_CHANGED`, `MANDATE_CHANGED`), it looks up an
existing event on `(sourceEmailId, eventType, deltaFrom, deltaTo)` and
returns that row instead of creating a second one. Covered by
`tests/integration/deal-intelligence.test.ts` Test 9.

## 3. Deal Risk Engine (spec §12-15, §60-61)

`src/lib/intelligence/risk-engine.ts`. Classification is deterministic
phrase-matching over the same risk-signal vocabulary
`src/lib/ai/extractors.ts` already produces (`classifyRiskType()`), never a
second AI call:

| RiskType | Example trigger phrase |
|---|---|
| `BUYER_CONCERN` | "buyer may withdraw", "concerns about…" |
| `CLIENT_SILENCE` | "hasn't responded", "gone quiet" |
| `VALUATION_PRESSURE` | "concerns about valuation" |
| `TIMELINE_DELAY` | "timeline may need to be pushed" |
| `FINANCING_UNCERTAINTY` | "financing remains unresolved" |
| `MANAGEMENT_CONCERN` | "management is reconsidering" |
| `DILIGENCE_ISSUE`, `COMPETITIVE_PRESSURE`, `DEAL_STALL`, `UNRESPONSIVE_COUNTERPARTY`, `OTHER` | reserved severities, no dedicated regex yet — fall through to `OTHER` |

`baseSeverityForSignal()` starts from a per-type base severity
(`LOW`..`HIGH`) and escalates one level on unambiguous language
(`/withdraw/i`) regardless of history — spec §14's "buyer is considering
withdrawing" worked example. `recordRisk()` additionally looks at how many
other `OPEN`/`ACKNOWLEDGED` risks the same deal has accumulated in the last
14 days (`ACCUMULATION_WINDOW_DAYS`); **2 or more** triggers one further
severity escalation and a `momentumWeakening: true` flag — spec §15's
"deal momentum weakening," never "deal will fail." Every `Risk` row is
written with a `status` lifecycle (`OPEN → ACKNOWLEDGED/DISMISSED/RESOLVED`,
Server Actions in `src/lib/actions/intelligence-actions.ts`, each writing
an `AuditLog` row) and links back to its `IntelligenceEvent`/`Email` for
evidence.

`computeRiskScore()` sums a severity-weighted total (`LOW`=8 … `CRITICAL`=45,
clamped to 100) across a deal's open risks into a separate, non-financial
0–100 **risk score** — labeled "Deal Risk Signal" in the UI
(`riskScoreLabel`: Minimal/Low/Moderate/Elevated/Severe), never framed as a
probability of failure and kept deliberately distinct from Momentum (§7).

`generateRiskEvents()` (`src/lib/pipeline/generation.ts`) calls
`recordRisk()` after writing the `RISK_DETECTED` intelligence event, and
sets `Deal.riskStatus` to `AT_RISK`/`WATCH` from the returned severity.

## 4. Deal Inactivity Engine (spec §16-18, §50, §59)

`src/lib/intelligence/inactivity.ts`. Tracks **meaningful activity**, not
raw email volume: `Deal.lastMeaningfulActivityAt` is a dedicated column,
bumped only at specific write sites (`touchMeaningfulActivity()` — a
stage/value change, a meeting, a task completion, or a matched relevant
email even with no detected field change) — never by, say, a
`NOT_RELEVANT` email or a page view.

Gap length is measured in **business days** (`businessDaysBetween()`,
weekends excluded, full holiday-calendar awareness out of scope — spec §17
says "where possible") against configurable thresholds:

```
INACTIVITY_WATCH_DAYS=4  INACTIVITY_INACTIVE_DAYS=7  INACTIVITY_STALE_DAYS=14
```

`classifyInactivity()` returns `ACTIVE`/`WATCH`/`INACTIVE`/`STALE`. Those
thresholds are themselves scaled by `stageThresholdMultiplier()`: a deal in
the first third of its workflow gets a **1.5×** allowance (early-stage gaps
are normal — spec §18's explicit non-goal "must NOT auto-classify early
inactivity as risk"), a deal in the last third gets **0.7×** (late-stage
gaps are concerning), the middle third gets 1× — generic over any banking
service's stage list via position-in-workflow, not hardcoded stage names.

Bankers can mark a deal exempt (`InactivityException`, upsert by `dealId`,
optional `ignoredUntil` expiry) via `ignoreInactivity()`/
`clearInactivityIgnore()` Server Actions — `runInactivityScan()` skips
exempt deals entirely and writes a `DEAL_INACTIVE` `IntelligenceEvent` +
`AuditLog` row for every other newly-INACTIVE/STALE deal, deduplicated
against a matching event in the last 24h.

## 5. Stage Intelligence (spec §19-21)

`src/lib/intelligence/stage.ts`. `explainStageChange()` turns a raw stage
transition into a grounded, generic phrase ("… has advanced from Due
Diligence to Final Bids, indicating the process has moved into final
bidding.") keyed off the new stage's key/label against a fixed phrase
table (diligence → "detailed diligence review," mandate → "a confirmed
mandate," etc.) — never invented per-deal narrative. `computeStageVelocity()`
reconstructs time-in-stage from a deal's `STAGE_CHANGE` `DealEvent`
history. `detectStageDelay()` compares current time-in-stage against the
historical average for other deals in the same banking service that passed
through a same-labeled stage, and **requires at least 2 historical
samples** before returning `isPotentialDelay: true` — with insufficient
data it reports no verdict rather than guessing (spec §21).

## 6. Valuation Intelligence (spec §22-25, §62-63)

`src/lib/intelligence/valuation.ts`. `DealValuationObservation` is a
new append-only table — every material valuation figure encountered
(`SELLER_EXPECTATION`/`BUYER_INDICATION`/`INDICATIVE_BID`/`FINAL_BID`/
`AGREED_VALUE`) gets its own row via `recordValuationObservation()`, so a
deal has a real trend, not just "current value." `computeValuationChange()`
returns absolute + percent change and **never divides by a zero or missing
previous value** (`percentChange: null` in that case — spec §23's explicit
requirement). `valuationAlertSeverity()` maps the percent magnitude against
configurable thresholds:

```
VALUATION_ALERT_MEDIUM_PCT=5  VALUATION_ALERT_HIGH_PCT=10  VALUATION_ALERT_CRITICAL_PCT=20
```

`applyChangeToDeal()`/`applyDealChanges()` (`src/lib/pipeline/suggestions.ts`)
record an observation and touch meaningful activity on every applied value
change, whether auto-applied or accepted via AI Review.

## 7. Deadline Intelligence (spec §26-27, §64-65)

`src/lib/intelligence/deadline.ts`. Deliberately **calendar-day** math
(`bucketDeadline`/`deadlineUrgency`), not business-day — a deadline is a
date a counterparty actually gave, not a gap-detection estimate.
`bucketDeadline()` buckets into `OVERDUE`/`TODAY`/`TOMORROW`/`THIS_WEEK`/
`NEXT_WEEK`/`LATER`; `deadlineUrgency()` follows spec §64's worked table
(7 days → `NORMAL`, 3 days → `ATTENTION`, tomorrow → `HIGH`, today/overdue →
`CRITICAL`). `computeDeadlinePriority()` additionally bumps an otherwise-
`NORMAL`, far-out but *explicit* deadline to `ATTENTION` when the deal is
high-value or high-priority (spec §27). `runDeadlineScan()` is the
escalation pass (spec §65): every overdue task on a `HIGH`/`CRITICAL`
priority (or ≥$100M) deal gets one `DEADLINE_DETECTED` escalation event,
deduplicated against a recent escalation for the same task within 24h.

## 8. Task/Recommendation Engine (spec §28-31)

`src/lib/intelligence/recommendations.ts`. Every recommendation is a
templated mapping (`RECOMMENDATION_TEMPLATES`) from an **already-detected**
`IntelligenceEvent` — never freestanding generic advice — so the "WHY?" is
always that event's own headline/detail plus its evidence chain
(`sourceEventId`, `sourceEmailId`). Ranked by the same `importanceScore`
every other Phase 4 surface uses.

## 9. Client Attention Engine (spec §32)

`src/lib/intelligence/client-attention.ts`. Aggregates deal-level signals
(inactive deals, upcoming deadlines, open opportunities, or simply ≥3
active deals) up to the client, with a one-line `recommendedAction` — so a
banker sees relationship-level attention needs without noticing the
pattern by hand across separate deal pages. Rendered as the Client Detail
page's "Client Attention" card.

## 10. Deal Momentum Score (spec §33-34, §61)

`src/lib/intelligence/momentum.ts`. Deliberately **distinct from the Risk
Engine's risk score** (§3): momentum answers "how active/progressive does
this deal look," risk answers "how many concerning signals exist" — a deal
can be simultaneously high-momentum and moderately risky. Composed from
recent-event volume, a recent stage change, task completion rate, overdue
tasks, and a risk-count penalty, clamped 0–100; `trend`
(`IMPROVING`/`STABLE`/`WEAKENING`/`STALLED`) compares this week's event
volume against last week's. Always labeled **"Operational Momentum"** in
the UI — never framed as probability of closing.

## 11. Intelligence Feed — What Changed? (spec §3-6, §35-36)

`src/lib/intelligence/feed.ts`. `getIntelligenceFeed()` is the filterable,
searchable read model (`FeedFilter`: `ALL`/`MY_DEALS`/`HIGH_PRIORITY`/
`STAGE`/`VALUATION`/`RISKS`/`INACTIVITY`/`DEADLINES`/`TASKS`/
`OPPORTUNITIES`/`CLIENT_ACTIVITY`), always ordered by `importanceScore desc,
occurredAt desc` — it only reads and filters, never recomputes the score.
`getWhatChangedSince()` powers both the dashboard's clickable "N deals
changed" summary and the pre-filtered feed it links to — the same query,
same time window, so the number shown always matches what the click
reveals (spec §38's "do not cheat").

## 12. Briefing Engine (spec §7-11, §39-45, §78)

`src/lib/intelligence/briefing.ts`. Pipeline exactly as specified:
**Events → Filtering → Importance Ranking → Deal Context → Task/Risk
Context → AI Summary → Structured Briefing.**

1. `windowStartFor()` — since the last briefing of the same type for this
   banker, or a 24h (morning) / 12h (evening) fallback.
2. Assembles five sections concurrently, each a real query:
   `getWhatChangedSince()` (priorities), `buildDealAdvancements()`
   (`STAGE_CHANGED` events in-window), `buildRisksSection()` (open risks,
   severity-ranked, top 2 per deal), `buildDeadlinesSection()` (tasks due
   within 14 days), `buildOpportunitiesSection()` (new/acknowledged
   opportunities in-window), plus `generateRecommendedActions()`.
3. The assembled facts (`BriefingFacts` — numbers and headlines only, no
   prose) are handed to `AIProvider.summarizeBriefing()`, which returns
   *only* a narrative string — every number in `content.summary` comes
   from `parseBriefingSummary(facts.summary)`, never re-derived from the
   AI's prose.
4. `parseBriefingContent()`/`parseBriefingSummary()`
   (`src/lib/intelligence/briefing-schema.ts`, Zod) validate the assembled
   shape before it's written — mirroring `extraction-schema.ts`'s pattern
   from Phase 3.
5. `collectSourceEventIds()` walks every section (`priorities`,
   `dealAdvancements`, `risks`, `opportunities`, `recommendedActions`) and
   collects every `sourceEventId` present, written to
   `Briefing.sourceEventIds` — the field `tests/integration/deal-intelligence.test.ts`
   Test 10 verifies resolves entirely to real, same-organization
   `IntelligenceEvent` rows.
6. `db.briefing.upsert()` on `(organizationId, userId, type, date)` — a
   briefing is **generated once per banker per day per type and stored**,
   not regenerated on every read; `getLatestBriefing()` serves it back,
   and the UI's "Regenerate" button is the only way to force a fresh run.

Phase 4 ships **manual generation only** (a button on `/intelligence/morning`
and `/intelligence/evening`, `generateMorningBriefingAction`/
`generateEveningBriefingAction` Server Actions) — `generateMorningBriefing()`/
`generateEveningBriefing()` are already separable service functions taking
`(organizationId, userId, now)`, so a future scheduled job
(`runInactivityScan`/`runDeadlineScan`/`runRiskScan` are similarly already
separable) can call them directly without any UI-layer change (spec §77-78).

## 13. UI surfaces (spec §37-40, §51-54)

- **`/intelligence`** — rewritten as the "What Changed?" primary
  experience: searchParams-driven filter/search/since, importance-tier
  badges, evidence popovers, Accept/Reject actions preserved from Phase 3.
- **`/intelligence/morning`, `/intelligence/evening`** — auto-generate the
  day's briefing if missing, render via a shared `BriefingView`, with a
  Regenerate button.
- **Dashboard** — reordered intelligence-first: Good Morning → What
  Changed → Top Priorities → Deadlines → Risks → Opportunities → Recent
  Activity, with `RisksCard`/`DeadlinesCard` added and
  `since-last-scan.tsx` rewritten onto `getWhatChangedSince()` with a
  clickable "N deals changed" linking into the pre-filtered feed.
- **Deal Detail** — a `DealIntelligenceOverviewPanel`
  (`src/lib/intelligence/deal-overview.ts` bundles momentum, open risks,
  inactivity status, valuation history, recommendations, and stage-delay
  for one deal) rendered above the existing grid.
- **Client Detail** — a "Client Attention" card from
  `computeClientAttention()`.
- **Notifications** — priority badges (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`),
  Dismiss action (`dismissedAt`, `dismissNotification()` Server Action),
  read/unread state preserved from Phase 1.

## 14. Audit logging (spec §70)

Every system-generated intelligence action writes `AuditLog`: risk
detection (`generateRiskEvents()`), inactivity detection
(`runInactivityScan()`), and every banker action in
`src/lib/actions/intelligence-actions.ts` (`acknowledgeRisk`,
`dismissRisk`, `resolveRisk`, `ignoreInactivity`, `clearInactivityIgnore`,
briefing generation).

## 15. Demo dataset scenarios (spec §73)

`prisma/seed.ts` / `prisma/seed/backlog.ts` / `src/lib/data/fixtures/deals.ts`
seed specific, illustrative Phase 4 scenarios, verified live end-to-end via
`runScan()` against the seeded database (not just unit assertions):

| Deal | Scenario | How it's live |
|---|---|---|
| Falcon | Stage advancement to Final Bids | curated backlog email with an explicit forward-moving stage phrase |
| Orion | Valuation increase $390M → $420M (+7.69%) | baseline fixture re-anchored to $390M; new curated "$420M indicative offer" backlog email — Run Scan produces a real `DealValuationObservation` and `DEAL_VALUE_CHANGED` event |
| Atlas | Inactivity | excluded from Phase 3's bulk/curated backlog generators (`bulkDeals` filter) so `lastMeaningfulActivityAt` stays untouched by Run Scan; fixture backdated to 9 business days before `DEMO_NOW` |
| Nova | Buyer concern (risk) | existing Phase 3 risk-signal backlog content, now also produces a categorized `Risk` row |
| Titan | Deadline tomorrow | existing Phase 3 deadline backlog content, now scored `HIGH` urgency |
| Apollo | New opportunity | existing Phase 3 opportunity-signal backlog content |
| Mercury | Financing risk | existing Phase 3 risk-signal backlog content, classified `FINANCING_UNCERTAINTY` |

Reseeding (`npx tsx prisma/seed.ts`) resets all of the above, including the
scan backlog, to pristine — the scenarios are reachable by clicking **Run
Scan**, not pre-baked into seeded `IntelligenceEvent` rows.

## 16. Testing

- `tests/unit/deal-intelligence-engines.test.ts` — spec §72 Tests 1-8
  directly against the pure engines (no database): stage-change importance
  scoring, the Orion valuation math (including the zero/null-denominator
  guard), Atlas's late-stage inactivity classification, an early-stage
  10-day gap *not* reading as high risk, `"concerns about valuation"` →
  `VALUATION_PRESSURE`, `"may withdraw from the process"` →
  `BUYER_CONCERN`/`HIGH`, a tomorrow deadline → `HIGH`/`TOMORROW`, a
  2-days-overdue deadline → `CRITICAL`/`OVERDUE`, plus
  `businessDaysBetween()`'s weekend-exclusion.
- `tests/integration/deal-intelligence.test.ts` — spec Test 1 (a
  high-importance stage change appears in What Changed and scores ≥75),
  Test 9 (dedup — the same `sourceEmailId` processed twice never creates a
  second event), Test 10 (every `Briefing.sourceEventIds` entry resolves
  to a real, same-organization `IntelligenceEvent`), and organization
  isolation (spec §69 — a second organization's events never leak into
  another org's feed and vice versa), all against self-contained fixtures
  (a second `Organization`/`User`/`Deal`), never depending on
  `prisma/seed.ts`'s mutable global state.

Run: `npx prisma generate && npx vitest run` (requires `DATABASE_URL` and
a migrated database — no seed required, since integration tests build
their own fixtures and clean up after themselves).

## 17. Known limitations / Phase 5 candidates

- **No scheduler.** Morning/evening briefings, inactivity scans, and
  deadline scans are triggered manually (buttons / Server Actions) per
  spec §80's explicit deferral — every entry point is already a plain
  `(organizationId, userId?, now)` function, so wiring a cron
  (Vercel Cron, Inngest, Trigger.dev) is additive, not a rewrite.
- **Risk type coverage is phrase-pattern based**, tuned to how the demo
  dataset phrases signals — `DILIGENCE_ISSUE`, `COMPETITIVE_PRESSURE`,
  `DEAL_STALL`, and `UNRESPONSIVE_COUNTERPARTY` are modeled (severity
  tables, UI) but have no dedicated detection regex yet; they fall through
  `classifyRiskType()`'s `OTHER` bucket until real-LLM extraction
  (Phase 3's own stated Phase 4 candidate) improves recall.
  `DILIGENCE_ISSUE`/etc. remain reachable via a manually-created `Risk`
  row (e.g. a future banker-initiated "flag a risk" UI) even without an
  auto-detection path.
- **Stage-delay historical samples compare stage *labels*, not keys**
  (`src/lib/intelligence/stage.ts`'s `detectStageDelay()`) — `DealEvent`
  only stores labels, and labels are unique per workflow in this dataset,
  but a future migration to also store the stage `key` on `DealEvent`
  would make this exact rather than an approximation.
- **No production-grade scheduling/queue infra, SSO, SOC2, or billing** —
  all explicitly out of scope per spec §80, unchanged from Phase 3's own
  stated limitations.
