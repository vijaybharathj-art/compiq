# Tattava — Phase 4.5: Production Hardening & Banker UX

Phase 4 built the Deal Intelligence layer. Phase 4.5 does not add new
intelligence engines — it makes the existing system feel trustworthy,
explainable, and safe to run in front of a real banker: a consistent trust
layer, an intelligence-first dashboard, tighter organization-isolation on
every mutation, and resilience when an AI call fails. Per the build
brief's own instruction, this document says plainly what was actually done
versus what's deferred — nothing below is claimed complete without the
runnable check (`npm run lint`, `npx tsc --noEmit`, `npx vitest run`,
`npx playwright test`, `npm run build`) that verified it.

## 0. Scope decision

The Phase 4.5 brief runs to 89 sections — a genuinely product-wide audit
plus a model-evaluation program. Building every section with real rigor in
one pass isn't credible work; claiming it would be exactly the kind of
"do not claim success without running the checks" violation the brief
itself warns against. This pass prioritized the sections with the highest
banker-trust impact and left the rest as explicit, itemized follow-up (§9
below) rather than silently skipped.

**Done this pass:** the trust layer (§1-2), the intelligence-first
dashboard and What Changed polish (§3), Deal Detail and Client Attention
UX (§4), Run Scan resilience (§5), an organization-isolation audit across
every Server Action and the two Phase 4.5-touched detail pages (§6), AI
narration failure isolation (§7), and targeted new tests (§8).

**Deferred:** a standalone Data Quality Center (`/settings/data-quality`),
a Low-Confidence Review Queue, an Intelligence Accuracy Dashboard with
model-evaluation tracking, banker feedback capture (Correct/Incorrect/
Partially correct) on AI Review, a Demo Mode reset function + banner, the
full 25-email canonical golden-test dataset, a 300+-email performance
test, structured observability logging, and a broader accessibility pass.
These are real, valuable, and each individually scoped enough to be its
own follow-up session — see §9.

## 1. Trust layer

`src/components/shared/badges.tsx`, `why-am-i-seeing-this.tsx`,
`why-this-matters.tsx` (new). One consistent vocabulary reused across
every intelligence surface instead of each page inventing its own:

- **`TrustBadge`** — `CONFIRMED` / `HIGH CONFIDENCE · 94%` / `MEDIUM
  CONFIDENCE · 82%` / `LOW CONFIDENCE · 61%`, tiered off the same
  thresholds `src/lib/ai/confidence-policy.ts` already uses (≥90 / ≥70).
  Where no confidence value exists at all, it renders **"Evidence
  available"** — never a fabricated number, never hidden entirely.
- **`IntelligenceLabelChip`** — `FACT` / `DETECTED SIGNAL` / `AI SUMMARY` /
  `RECOMMENDATION`, mapped deterministically off `IntelligenceCategory`
  (`DEAL_CHANGE→FACT`, `RISK/OPPORTUNITY/CLIENT_ACTIVITY/IMPORTANT_EMAIL→
  DETECTED_SIGNAL`, `TASK→RECOMMENDATION`) — a structural rule, not a
  per-event judgment call, so it stays auditable.
- **`WhyAmISeeingThis`** — the standardized evidence popover (source,
  date, deal, quoted excerpt, confidence) wired into What Changed, the
  dashboard's Top Priorities, and anywhere else a card cites a source
  email.
- **`WhyThisMatters`** — a labeled block rendering an event's own grounded
  `detail` text (already produced deterministically by
  `src/lib/intelligence/stage.ts`'s `explainStageChange()` or a risk's
  description) — never freestanding AI commentary.

**Known follow-up:** `src/components/shared/evidence-citation.tsx`
(pre-existing, used by the Task board and AI Review) duplicates
`WhyAmISeeingThis`'s job in a slightly different shape. Left as-is rather
than risk regressing those call sites under time pressure — unifying the
two is a clean, low-risk follow-up.

## 2. Fact vs. AI labeling in practice

`src/components/intelligence/what-changed-item.tsx` and
`src/components/dashboard/top-priorities.tsx` now render every card with:
importance tier, category label chip, headline (fact), a `WhyThisMatters`
box for the grounded detail, `TrustBadge`, and `WhyAmISeeingThis` where a
source email exists. `src/components/tasks/task-board.tsx` gained an
**AUTO-GENERATED** badge + "Reason:" prefix + `TrustBadge`, shown only
when `task.sourceEvidence` is present (i.e. the task came from the
pipeline, not a banker) — `createTaskFromRecommendation()` (new, §4)
deliberately never sets that field, so a banker-created task is never
mislabeled as AI-generated.

## 3. Dashboard & What Changed

**Dashboard** (`src/app/(app)/dashboard/page.tsx`, rewritten) now follows
Good Morning → stat bar → **Top Priorities** → What Changed → Deadlines →
Risks → **Deal Momentum** → **Client Attention** → Action Required → New
Opportunities. The generic six-tile stat grid (Active Deals / Total Deal
Value / Deals Advanced / Deals At Risk / …) is gone — it was the most
literally "generic CRM dashboard" part of the page and directly
contradicted this phase's core objective; those numbers are still one
click away on `/deals`. The stat bar now reads "N deals changed / N
require attention / $X deal value affected" — three numbers, not six.

New: **`TopPrioritiesCard`** (`src/components/dashboard/top-priorities.tsx`)
renders the same `getWhatChangedSince()` result the stat bar already
computed (one query, not two) as full evidence cards with a recommended
action derived from the shared `recommendedActionText()` helper (exported
from `recommendations.ts` so the dashboard and the Recommendation Engine
never disagree on wording). **`MomentumSummaryCard`** is deliberately
scoped to the deals already surfacing in Top Priorities (≤5), not every
active deal — computing momentum is several queries per deal, and
iterating a full portfolio would be exactly the N+1-shaped cost this
phase is supposed to reduce, not add. **`ClientAttentionSummaryCard`**
reuses `computeClientAttention()` verbatim, so its reasons never disagree
with the Client Detail page's own card.

**What Changed** (`/intelligence`) gained: clickable summary-bar metrics
(each links into the matching filter), **Sort** (Highest Importance /
Newest — default Highest Importance, per spec) and **Group** (No grouping
/ By Deal / By Category) controls, all composing together and preserved
in the URL (`?filter=RISKS&sort=NEWEST&group=DEAL`) rather than resetting
each other. `getIntelligenceFeed()` gained a `sort` parameter to back it.

## 4. Deal Detail & Client Attention

**Deal Detail** (`DealIntelligenceOverviewPanel`): Momentum and Risk Signal
tiles are now click-to-reveal "Why?" popovers — Momentum shows Positive/
Negative driver lists (from `momentum.ts`'s own `reasons[]`, never a raw
formula); Risk shows a severity breakdown plus the overall label. New
**Stage Timeline** section (`computeStageVelocity()`, already existed in
`stage.ts` but wasn't wired into the overview) with the current stage
visually marked. **Valuation History** is now a connected timeline with
period-over-period `%` change between entries (`computeValuationChange()`,
reused, never re-derived) and a `TrustBadge` per observation.

**Client Attention** (`ClientDetailPage`): now shows an **Attention
Required** badge, the individual `reasons[]` as a bulleted list (added to
`ClientAttentionEntry` — previously computed internally but only exposed
as one joined sentence), and a **Create Task** button
(`createTaskFromRecommendation()`, new Server Action) that creates a real
`Task` row from the recommendation, org-scoped and audit-logged.

## 5. Run Scan resilience

`runScan()` (`src/lib/pipeline/orchestrator.ts`) now checks for an
existing `RUNNING` `EmailProcessingJob` for the organization before
starting a new one, throwing `ScanAlreadyRunningError` instead — "do not
start duplicate jobs" is now a real server-side guarantee, not just a
disabled button. The scan page computes this at render time too
(`isJobRunning`), so a stale page load (a second tab, a page opened mid-
scan) shows **"Scan in progress"** immediately rather than only reacting
to a failed click. Stage pills in the running view now distinguish
completed (checked, positive-colored) / processing (pulsing, accent) /
pending (muted) instead of a binary highlighted/not.

**Known limitation:** the running-job check is a read-then-write, not a
database-level unique constraint or advisory lock — it narrows the
duplicate-scan window from "the whole scan's duration" to one query
round-trip, but a true two-request race (same millisecond, two tabs) isn't
fully closed without adding a unique partial index, which felt like more
infrastructure than this pass's scope justified. Documented, not silently
assumed safe.

## 6. Security & organization isolation audit

Audited every Server Action in `src/lib/actions/*.ts` for the exact
pattern spec §57-58 calls out: authenticated ≠ authorized. Found and
fixed real gaps — every one of these previously fetched or mutated an
entity by `id` alone, trusting the caller's argument with no
`organizationId` check:

| File | Function | Fix |
|---|---|---|
| `mutations.ts` | `updateDealStage` | `findFirstOrThrow` → scoped by `organizationId: DEMO_ORG_ID` |
| `mutations.ts` | `updateTaskStatus` | same |
| `mutations.ts` | `reviewIntelligenceEvent` | `update` → `updateMany` with a scoped `where`, throws if 0 rows matched |
| `intelligence-actions.ts` | `acknowledgeRisk`/`dismissRisk`/`resolveRisk` | added a scoped existence check before the write |
| `intelligence-actions.ts` | `ignoreInactivity`/`clearInactivityIgnore` | added `requireDealInOrg()` before touching `InactivityException` |
| `intelligence-actions.ts` | `createTaskFromRecommendation` (new) | verifies the target `dealId`/`clientId` belongs to the org before linking |
| `pipeline-actions.ts` | `acceptExtraction`/`rejectExtraction` | scoped through `email.thread.emailAccount.organizationId` (AiExtraction has no `organizationId` column of its own, and `dealId` is optional so it can't anchor the check alone) |

Also added a read-side guard on the two pages Phase 4.5 touches directly:
`deals/[dealId]/page.tsx` and `clients/[clientId]/page.tsx` now `notFound()`
a deal/client id that resolves but belongs to a different organization,
closing that path for the intelligence panels this phase added.

**Known, larger limitation — reported, not fixed:** the entire Phase 1
read-repository layer (`src/lib/data/prisma-repository.ts` — every
`list()`/`get()` backing Deals, Clients, Tasks, Dashboard, Search, Audit
Log) queries by id/filters with **no `organizationId` scoping anywhere in
the file**. In the current single-organization demo deployment this has
no observable effect (there is no second organization, no org switcher,
and ids are non-enumerable cuids), but it is a genuine multi-tenancy gap
that would matter the moment a second organization exists. Retrofitting
scoping across that entire file is a large, cross-cutting change to code
this project's own instructions say not to rebuild in this phase
("preserve existing functionality," "do not rebuild Phase 1-4") — so it is
reported here as the single most important Phase 5 security item rather
than attempted as a rushed, unverified rewrite.

## 7. AI failure isolation

Per spec §72-73, an AI narration failure must never take real, already-
computed data down with it. `generateBriefing()`
(`src/lib/intelligence/briefing.ts`) now wraps only the
`AIProvider.summarizeBriefing()` call in a try/catch — every deterministic
section (priorities, deal advancements, risks, deadlines, opportunities,
recommended actions) is assembled *before* that call and is written
regardless of whether it succeeds. On failure, `Briefing.status` is set to
`FAILED` (an enum value that already existed but was never actually used)
and `BriefingView` renders a **"Briefing narrative unavailable"** notice
in place of the prose paragraph — every structured section below it still
renders normally, because it was never at risk. This is a real behavior
change, not cosmetic: previously an AI-provider exception would have
thrown out of `generateBriefing()` entirely, losing the whole briefing.

## 8. Testing

New: `tests/unit/phase4_5-trust-and-quality.test.ts` — `TrustBadge`'s
underlying `trustStatusFromConfidence()` tier boundaries and its
never-fabricate-null contract; `recommendedActionText()` returns a real
template for a covered event type and `null` (never invented advice) for
an uncovered one; a documented false-positive case (spec §65-66) — an
incidental "$420M transaction" mention in an unrelated market-report
sentence still gets extracted by `detectMoneySignal()` at 88% confidence
(hedge/confirm-term detection alone doesn't judge relevance), but
`decideConfidenceAction(88)` proves the actual safety net: `SUGGESTED_
PENDING`, never `AUTO_APPLY` — a banker reviews it, the deal is never
silently corrupted.

New: `tests/integration/phase4_5-quality.test.ts` — duplication testing
extended from the existing 2x case to 5x (spec §67's "1/2/5/10 times, no
duplicate events"); a direct verification that the organization-scoped
lookup pattern added in §6 actually excludes a same-id, different-org
task and deal.

Full suite: **67/67 passing** (`npx vitest run`), **6/6** Playwright e2e
(`npx playwright test`), `npm run lint` / `npx tsc --noEmit` / `npm run
build` all clean.

**Known gap:** no full 25-email canonical golden dataset (spec §63-64) —
the existing Phase 3 extraction tests already cover confirmed-vs-hedged
value language, vague-sentiment non-stage-changes, and irrelevant-mention
non-classification (see `tests/unit/pipeline-extraction.test.ts`), and
this phase adds one more documented false-positive case, but a dedicated,
labeled evaluation dataset with expected outputs per email is a real,
separately-scoped follow-up, not something to approximate with a handful
of ad hoc cases.

## 9. Recommended Phase 5 (or a focused Phase 4.5b)

In priority order:

1. **Organization scoping in `prisma-repository.ts`** (§6) — the highest-
   value remaining security item, sized as its own reviewable change.
2. **Data Quality Center** (`/settings/data-quality`) and **Low-Confidence
   Review Queue** — genuinely useful, well-scoped, no architectural risk.
3. **Model evaluation**: banker feedback capture on AI Review
   (Correct/Incorrect/Partially correct) feeding an Intelligence Accuracy
   Dashboard — needs a small schema addition (a `Feedback` table) but is
   additive, not a rewrite.
4. **Demo Mode reset function + banner** — bounded, useful for repeated
   demos without a full reseed.
5. **The 25-email canonical golden dataset** with per-email expected
   outputs, as its own test fixture.
6. **Unify `EvidenceCitation` and `WhyAmISeeingThis`** (§1) into one
   component.
7. A real database-level guard against the Run Scan race (§5) — a unique
   partial index or advisory lock, once it's clear the read-then-write
   window is worth closing for this deployment's actual usage pattern.
