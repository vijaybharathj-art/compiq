# Tattava — AI Extraction Specification

## 1. Pipeline

```
EMAIL → INGESTION → THREAD RECONSTRUCTION → RELEVANCE CLASSIFICATION →
IB ENTITY EXTRACTION → DEAL MATCHING → CHANGE DETECTION →
CONFIDENCE SCORING → HUMAN REVIEW WHERE REQUIRED → DATABASE UPDATE →
INTELLIGENCE FEED
```

Each stage is a pure function of its input plus prior organizational
context — no stage silently mutates shared state; the pipeline runner
persists a `AiExtraction` row per email before any `Deal`/`Task`/
`Opportunity` write, so every UI-visible change is traceable back to one
extraction record.

## 2. Ingestion & thread reconstruction

`EmailProvider.listThreads()` / `getThread()` pull raw messages into
`EmailThread` / `Email` rows. Threads are reconstructed using the
provider's native thread id first, falling back to `References`/`In-Reply-
To` headers and normalized subject matching (`Re:`/`Fwd:` stripped) when a
provider omits threading.

## 3. Relevance classification

Every email is scored into exactly one bucket:

- **Investment Banking Relevant** — deal discussions, client
  communications, transaction updates, valuation discussions, buyer/
  investor communications, financing discussions, mandate discussions,
  management meetings, due diligence, transaction documentation, closing
  activity, origination signals.
- **Possibly Relevant** — mentions banking-adjacent terms but lacks a
  clear deal/client anchor; queued for extraction but held to a higher
  confidence bar before writing anything.
- **Not Relevant** — internal admin, personal, marketing, newsletters,
  calendar logistics with no deal content. Not processed further.

Classification output: `{ relevance, relevanceScore: 0-1, reasons: string[] }`.

## 4. IB entity extraction

For Relevant/Possibly-Relevant emails, extract a structured
`ExtractionResult`:

```ts
interface ExtractionResult {
  clientName?: string
  companyName?: string
  projectCodename?: string
  dealType?: DealType
  bankingService?: BankingServiceCode
  enterpriseValue?: { amountMinorUnits: bigint; currency: string }
  equityValue?: { amountMinorUnits: bigint; currency: string }
  stageKey?: string
  action?: { description: string; dueHint?: string }
  timeline?: string
  participants?: { name: string; role: DealParticipantRole }[]
  riskSignal?: string
  opportunitySignal?: string
  confidencePercent: number
  evidence: { quotedExcerpt: string; senderName: string; sentAt: string }
}
```

Worked example (from the brief):

> "Following yesterday's discussion, Acme is comfortable proceeding at an
> enterprise value of approximately $750m. They would like to proceed with
> management meetings next week."

→ `clientName: "Acme"`, `projectCodename: "Project Falcon"` (resolved via
deal matching, not stated in the email), `dealType: "SELL_SIDE_MA"`,
`enterpriseValue: 750,000,000 USD`, `stageKey: "management_meetings"`,
`action: "Schedule management meeting"`, `timeline: "next week"`,
`confidencePercent: 94`.

## 5. Deal matching

Signals used, in descending weight: explicit project codename mention →
thread continuity (email already linked to a `EmailThread.dealId`) →
participant email domains matched against `DealParticipant`/`Client`
contacts → client/company name fuzzy match → deal terminology + sector
overlap. Output: `{ matchType: EXISTING_DEAL | NEW_DEAL_EXISTING_CLIENT |
NEW_CLIENT | POTENTIAL_OPPORTUNITY | UNKNOWN, dealId?, clientId?,
confidencePercent }`.

**Never create a duplicate deal** because two emails phrase the same deal
differently — matching always checks existing deals for the resolved
client before proposing `NEW_DEAL_EXISTING_CLIENT`.

## 6. Change detection

Diff the extraction against the current `Deal` record field-by-field.
Detected change types: `VALUE_CHANGE`, `STAGE_CHANGE`, `NEW_PARTICIPANT`,
`NEW_DEADLINE`, `NEW_TASK`, `TIMELINE_CHANGE`, `MANDATE_CHANGE`,
`RISK_CHANGE`, `STRUCTURE_CHANGE`. Each becomes a `DealEvent` and an
Intelligence Feed item, e.g.:

```
DEAL VALUE CHANGE
$680M → $750M
Source: Email from client · Confidence: 92%
```

## 7. Confidence scoring & write policy

High-impact fields — deal value, deal stage, mandate status, closing date,
client, transaction type:

| Confidence | Behavior |
|---|---|
| > 90% | Auto-apply (if org policy allows auto-apply), write `AuditLog` entry |
| 70–90% | Create `AiExtraction` with `appliedStatus: SUGGESTED_PENDING`; surfaced as "AI Suggested Update" with Accept / Reject / Review |
| < 70% | No write to the `Deal` record; feed item only, labeled "Potential information detected" |

Low-impact fields (e.g. free-text notes, non-binding timeline hints) may
auto-apply at a lower bar since they carry no risk of misrepresenting deal
state.

## 8. Evidence system

Every `AiExtraction` has ≥1 `AiExtractionEvidence` row: sender, timestamp,
and the exact quoted excerpt that justified the extraction. The UI always
renders evidence as a clickable citation that opens the original email —
never a bare confidence number with nothing behind it.

## 9. Origination intelligence

Signal phrase list (non-exhaustive, extend over time): "strategic
alternatives", "acquisition", "refinancing", "capital raise", "IPO",
"considering a sale", "evaluating financing", "expansion", "potential
transaction", "interested in acquiring", "looking for financing". A match
creates an `Opportunity`, always phrased as a hedge ("Potential opportunity
detected"), never as confirmed fact.

## 10. `AIProvider` contract

```ts
interface AIProvider {
  classifyRelevance(email: EmailInput): Promise<RelevanceResult>
  extractEntities(email: EmailInput, context: DealContext): Promise<ExtractionResult>
  matchDeal(extraction: ExtractionResult, candidates: DealCandidate[]): Promise<DealMatchResult>
}
```

`AnthropicProvider` and `OpenAIProvider` implement this against
`AI_PROVIDER=anthropic|openai`; both are stubbed (`PLANNED INTEGRATION`) —
no live API keys exist in this environment. **Phase 1 ships a third, live
implementation: `DemoExtractionProvider`** (`AI_PROVIDER=demo`, the
default), a rule-based extractor using keyword/regex heuristics for
relevance, dollar amounts, and risk/opportunity signals. It implements the
exact same interface and is what `prisma/seed.ts` calls to generate the
`confidencePercent`, `matchType`, and evidence excerpts on every seeded
`AiExtraction`/`IntelligenceEvent` row — so the UI, confidence-scoring
policy (§7), and evidence system (§8) all exercise real code paths today,
with swapping in a real LLM provider changing zero downstream code. Prompts
for the LLM-backed providers are versioned under `src/lib/ai/prompts/` and
never embed org-specific data as few-shot examples — extraction context is
passed as structured input, not baked into the prompt text, so no customer
email content is retained as a "training example."

## 11. Data policy

Customer email content is processed only to provide the extraction
service for that organization. It is never used to train or fine-tune a
model, never shared across organizations, and evidence excerpts are stored
only as long as the source email is retained by the connected mailbox
account (deleting the `EmailAccount` connection cascades evidence
deletion). See `SECURITY.md` §5.
