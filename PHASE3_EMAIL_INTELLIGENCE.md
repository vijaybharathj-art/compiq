# Tattava — Phase 3: Email Intelligence Engine

Phase 1 made Postgres the live runtime. Phase 3 adds the technology that
differentiates Tattava from a generic CRM: a modular pipeline that turns raw
email into structured deal intelligence. This document is the persistent
source of truth for that pipeline — `CLAUDE.md` links here alongside the
other root docs.

Real Gmail/Microsoft 365 ingestion is **not** part of this phase. Everything
below runs against `DemoEmailProvider`, a genuine `EmailProvider`
implementation backed by the seeded Postgres mailbox, so the pipeline is
provably real without live OAuth credentials.

## 1. Pipeline architecture

```
EMAIL SOURCE → INGESTION → NORMALIZATION → THREAD RECONSTRUCTION →
RELEVANCE CLASSIFICATION → IB ENTITY EXTRACTION → CLIENT MATCHING →
DEAL MATCHING → CHANGE DETECTION → CONFIDENCE SCORING →
AI SUGGESTION / AUTO-UPDATE → EVIDENCE STORAGE → DEAL TIMELINE →
TASK GENERATION → INTELLIGENCE FEED → DASHBOARD
```

Each stage is its own module under `src/lib/pipeline/`, not one large
function:

| Stage(s) | Module |
|---|---|
| Normalization, participant resolution | `normalization.ts` |
| Relevance classification | `classification.ts` |
| Client matching, deal matching | `matching.ts` |
| Change detection | `change-detection.ts` |
| Confidence scoring, AI suggestion/auto-update, evidence storage, deal timeline | `suggestions.ts` (+ `@/lib/ai/confidence-policy.ts`) |
| Task generation, meeting detection, risk detection, opportunity detection | `generation.ts` |
| Intelligence event model | `intelligence-events.ts` |
| Orchestration, job tracking, logging | `orchestrator.ts` |
| Read models for the UI | `queries.ts` |

`orchestrator.ts#runScan()` is the entry point — it creates one
`EmailProcessingJob`, pulls `EmailProvider.getNewMessages()`, and runs every
stage per email inside a `try`/`catch` so one bad email never aborts the
scan or loses data (§33 below). It is invoked by the `triggerEmailScan()`
Server Action (`src/lib/actions/pipeline-actions.ts`), which runs
synchronously to completion — no background worker is assumed, since a
Vercel serverless function shouldn't be treated as a permanent worker (see
§8). For a demo-scale backlog (~90 emails, pure regex/string work, no
external API latency) this completes in low single-digit seconds.

## 2. Provider abstractions

### `EmailProvider` (`src/lib/email/`)

```ts
interface EmailProvider {
  getThreads(accountId, since?): Promise<EmailThreadSummary[]>
  getThread(accountId, providerThreadId): Promise<EmailThreadDetail>
  getMessages(accountId, providerThreadId): Promise<EmailMessage[]>
  getMessage(accountId, providerMessageId): Promise<EmailMessage>
  getNewMessages(accountId, since?): Promise<EmailMessage[]>
  getAttachments(accountId, providerMessageId): Promise<EmailAttachmentRef[]>
  downloadAttachment(accountId, attachmentId): Promise<Buffer>
  markProcessed(accountId, providerMessageId): Promise<void>
  watch(accountId): Promise<WatchHandle>
}
```

`DemoEmailProvider` is the live implementation — every method is a real
Prisma query/mutation against the seeded mailbox (`getNewMessages` returns
`Email` rows with `processingStatus: PENDING`; `markProcessed` flips that
row to `PROCESSED`). `GmailProvider` and `MicrosoftGraphProvider` implement
the same interface but throw `PLANNED INTEGRATION` errors — the future
implementations are expected to support initial historical sync,
incremental sync, webhook subscriptions, token refresh, rate-limit backoff,
deleted-message reconciliation, and attachment processing (spec §35).
`getEmailProvider()` resolves to Demo unless `EMAIL_PROVIDER=live`.

### `AIProvider` (`src/lib/ai/`)

```ts
interface AIProvider {
  classifyRelevance(email, context: ClassificationContext): Promise<RelevanceResult>
  extractEntities(email, context: DealContext): Promise<ExtractionResult>
  matchDeal(extraction, candidates): Promise<DealMatchResult>
}
```

`DemoAIProvider` is a genuine rule-based implementation — not a mock. It:

- Classifies relevance using both banking terminology **and** context
  (thread already linked to a deal, sender is a known contact/internal
  banker, a known client/company is named) — content signal is required;
  context can amplify or, only when very strong, substitute for it. Sender
  identity alone never manufactures relevance out of a zero-content email.
- Extracts the strict schema below via composable pure helpers in
  `src/lib/ai/extractors.ts` (`parseDeadline`, `detectStageSignal`,
  `detectMoneySignal`, `detectRiskSignals`, `detectOpportunitySignal`,
  `detectMeetings`, `extractProjectCodename`, `extractRoleMentions`,
  `extractActions`) — each independently unit-tested.
- Never reports a stage change from vague sentiment: `detectStageSignal`
  requires both a stage-defining noun phrase *and* an explicit
  forward-moving verb.
- Distinguishes a confirmed statement ("Enterprise value is $750M") from a
  hedged one ("we think $750M could be achievable") via surrounding-text
  hedge/confirm term lists, producing a materially different confidence.

`AnthropicProvider`/`OpenAIProvider` remain planned integrations
(`AI_PROVIDER=anthropic|openai`) implementing the identical interface —
swapping providers changes zero pipeline or UI code.

## 3. Extraction output — strict schema

`src/lib/ai/extraction-schema.ts` defines `ExtractionResultSchema` (Zod).
Every provider's output — demo or a real LLM — is parsed against it before
anything is written to the database ("never trust raw LLM output
directly"). Fields: `clientName`, `companyName`, `dealName`,
`bankingService`, `dealType`, `dealValue`/`enterpriseValue`/`equityValue`,
`stageKey` (+ `stageConfidencePercent`/`valueConfidencePercent` when the
provider can distinguish per-field confidence), `buyers`/`sellers`/
`investors`/`lenders`/`advisors`/`lawyers`/`accountants` (string arrays),
`leadBanker`, `dealTeamMembers`, `deadline` (`originalText`/
`normalizedDate`/`confidencePercent`), `meetings[]`, `actions[]`,
`transactionStatus`, `riskSignals[]`, `opportunitySignal`/
`opportunitySignalText`, `confidencePercent`, `promptVersion`, `evidence`.
Absent information is `null`/`[]`, never guessed.

## 4. Prompt versioning

`src/lib/ai/prompts/` holds one file per stage — `classification.ts`
(`CLASSIFICATION_PROMPT_V1`), `extraction.ts` (`EXTRACTION_PROMPT_V1`),
`deal-matching.ts` (`DEAL_MATCHING_PROMPT_V1`). Every `EmailClassification`,
`AiExtraction`, and `DealMatchResult` row stores the version that produced
it, independent of which provider is active — bumping a prompt never
rewrites history in place, only what's produced after the bump.

## 5. Deal matching engine

`src/lib/pipeline/matching.ts` combines multiple signals rather than
trusting the AI's own guess alone:

1. `matchClient` — exact client-name match, else participant email
   resolved to a `Contact` → that contact's client.
2. `matchDeal` — calls `AIProvider.matchDeal()` (codename match → client
   match → opportunity signal → new-deal-existing-client → unknown, in that
   priority), then applies a deterministic **thread-continuity override**:
   if the email's thread is already linked to a deal, that wins over a
   lower-confidence AI guess — but never over an equally-explicit ≥95%
   codename match to a *different* deal, so a genuine correction isn't
   silently suppressed.

This is what prevents "Project Falcon" / "Falcon Acquisition" / "Project
Falcon M&A" from fragmenting into separate deals — matching keys off
codename, client, and thread continuity together, not name equality alone.

New-transaction language never creates a confirmed deal automatically: a
`POTENTIAL_OPPORTUNITY` match writes an `Opportunity` row
(`status: NEW`) for a banker to accept, convert, or dismiss — never an
auto-created `Deal`.

## 6. Change detection & confidence policy

`change-detection.ts` diffs a matched deal's live state against the new
extraction (value, stage) and additionally dampens a stage "change" that
would move a deal *backward* relative to its current stage's `sortOrder` —
the phrase-based detector is tuned for forward language, so a backward
match more likely means a different deal's vocabulary coincidentally fired
than a real regression.

`src/lib/ai/confidence-policy.ts` implements the policy, configurable via
env vars (`AI_AUTO_APPLY_THRESHOLD` default 90, `AI_REVIEW_THRESHOLD`
default 70):

| Confidence | Decision | What happens |
|---|---|---|
| ≥ auto-apply threshold | `AUTO_APPLY` | Deal mutated immediately, `DealEvent` + `IntelligenceEvent` written, `AiExtraction.appliedStatus = AUTO_APPLIED` |
| ≥ review threshold | `SUGGESTED_PENDING` | No mutation yet — surfaced in **AI Review** (`/intelligence/review`) for Accept/Reject |
| below | `INFO_ONLY` | No mutation — stored as low-confidence intelligence only |

One `AiExtraction` row is written per detected change (not one row per
email) so the Review Center can accept/reject exactly one suggestion at a
time, each carrying its own `AiExtractionEvidence`.

## 7. Human review

**AI Review** (`/intelligence/review`) lists every `SUGGESTED_PENDING`
extraction the live pipeline produced (scoped by `processingJobId IS NOT
NULL`, which excludes Phase 1's differently-shaped historical backfill
rows). Accept applies the change through the exact same
`applyChangeToDeal()` path the pipeline's own `AUTO_APPLY` branch uses, so
accepted-by-a-human and auto-applied changes are indistinguishable in the
deal timeline other than the note. Reject marks the row `REJECTED` with no
mutation. Both write an `AuditLog` entry.

## 8. Jobs, observability, and error recovery

`EmailProcessingJob` (`displayId` like `SCAN-20260824-001`) is the unit of
observability — `stage`, running counters, `startedAt`/`finishedAt`, and
`errorMessage` if the whole scan fails catastrophically.
`EmailProcessingLog` rows are per-stage, metadata-only (relevance verdicts,
match types, confidence numbers, error messages) — **never full email
bodies, tokens, or credentials** (spec §32/§36).

Per-email failures are isolated: `Email.processingStatus` moves
`PENDING → PROCESSING → PROCESSED | PROCESSING_FAILED`, with the error
message stored on the row. A failed email is never lost and never silently
retried into a duplicate — it stays `PROCESSING_FAILED` until a future
retry path (or a re-run of `runScan`, which only ever picks up `PENDING`
rows) processes it again.

The current implementation is a simple in-process sequential queue — a
demo-appropriate choice, not a production one. It's architected so a real
queue (BullMQ/Redis, SQS, Inngest, Trigger.dev) can replace the loop inside
`runScan()` without touching any pipeline stage module, since each stage
already takes plain data in and writes plain rows out.

## 9. Dashboard: Since Your Last Scan

`src/components/dashboard/since-last-scan.tsx` computes deals-changed,
actions-required, opportunities, and risks **from `IntelligenceEvent`/`Task`
rows created since the last completed job's `finishedAt`** — never a
hardcoded number (spec §38's explicit "do not cheat" requirement).

## 10. Demo dataset

`prisma/seed.ts` seeds 202 emails total: ~112 pre-processed (Phase 1/2's
narrative history, `processingStatus: PROCESSED`) plus a ~90-email
unprocessed backlog (`prisma/seed/backlog.ts`, `processingStatus: PENDING`)
that **Run Scan** actually works through — relevant/irrelevant/ambiguous
mail, new-opportunity signals, existing-deal updates, buyer/counterparty
and internal-banker correspondence, task requests, deadlines, value and
stage changes, and risk signals, spread across real seeded deals/clients so
matching has something genuine to resolve.

## 11. Testing

- `tests/unit/pipeline-extraction.test.ts` — the 8 required cases (explicit
  vs. hedged value, stage-signal + task from a management-meeting request,
  no stage change from vague sentiment, an unrelated "valuation" email,
  opportunity vs. confirmed deal, deadline normalization + the ambiguous-
  phrasing guard), exercised directly against `DemoAIProvider`.
- `tests/integration/pipeline-matching.test.ts` — two independent emails
  naming the same project codename resolve to the same `dealId` (a
  self-contained fixture, not dependent on seed state).

## 12. Known limitations / Phase 4 candidates

- Real Gmail/Microsoft Graph ingestion, real LLM providers, and a real job
  queue remain planned integrations (interfaces exist, network calls throw
  or the queue is in-process).
- Entity role extraction (`buyers`/`lawyers`/etc.) is marker-based regex
  tuned to how the demo dataset phrases things, not general NLP — a real
  LLM provider would materially improve recall on unconstrained phrasing.
- `DealParticipant` rows aren't created automatically from extracted role
  names yet (would require fuzzy-matching free text to `Company` rows
  without fabricating fake companies) — extracted names are retained in
  `AiExtraction.extractedFields` for evidence, but not yet promoted to
  structured participant rows.
- Mailbox isolation (spec §31) is enforced today only at the
  single-organization level Tattava already operates at; per-user mailbox
  scoping is a Phase 4 concern once real OAuth accounts exist.
