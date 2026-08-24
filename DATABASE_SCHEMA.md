# Tattava — Database Schema Reference

Source of truth for structure is `prisma/schema.prisma`. This document is
the human-readable map of it, kept in sync manually whenever the schema
changes.

## Conventions

- Primary keys: `String @id @default(cuid())`.
- Multi-tenancy: every tenant-scoped table carries `organizationId` with an
  index; repositories must always filter by it.
- Money: `valueMinorUnits BigInt` + `currency String` (ISO 4217), never
  `Float`.
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Soft state over hard deletes for anything with audit relevance (tasks,
  deals) via a `status`/`dismissedAt` field; hard deletes are reserved for
  genuinely transient rows.

## Entity groups

### Identity & tenancy
- **User** — id, email, name, image, authProvider, createdAt.
- **Organization** — id, name, slug, plan, createdAt.
- **OrganizationMember** — userId, organizationId, role (`OWNER | ADMIN |
  BANKER | ANALYST | VIEWER`), team (`MA | ECM | DCM | LEVERAGED_FINANCE |
  RESTRUCTURING | PRIVATE_CAPITAL | ADVISORY`), title (job title, e.g.
  "Vice President, DCM" — display-only, distinct from `role`'s access
  level), notifyDealChanges/notifyRiskAlerts/notifyTaskReminders/
  notifyDailyDigest (booleans backing the Settings → Notifications form),
  joinedAt. `Account`/`Session` are the standard Auth.js adapter
  tables for the OAuth path; the live Credentials demo login uses JWT
  sessions and doesn't populate them.

### CRM core
- **Client** — organizationId, name, relationshipStatus (`ACTIVE |
  DORMANT | PROSPECT | FORMER`), sectorId, primaryBankerId, foundedYear,
  headquarters, website, createdAt.
- **Company** — organizationId, name, sectorId, description, website,
  isClient (bool) — represents counterparties/targets/investors as well as
  the client's own operating entity when distinct from `Client`.
- **Contact** — clientId, name, title, email, phone, isKeyContact.
- **Sector** — id, name (GICS-style sector taxonomy).

### Deal core
- **Deal** — the central object (see field list below).
- **DealWorkflow** — organizationId (nullable = system default),
  bankingService, name — one ordered workflow per service.
- **DealStageDefinition** — workflowId, key, label, sortOrder — the
  service-specific stage list (Origination, Pitch, Mandate, … per
  `PRODUCT_SPEC.md` §7).
- **DealParticipant** — dealId, companyId, role (`BUYER | SELLER |
  INVESTOR | LENDER | LAW_FIRM | ACCOUNTANT | TARGET | ADVISOR_OTHER`).
- **DealTeamMember** — dealId, userId, role (`LEAD_BANKER | MD | VP |
  ASSOCIATE | ANALYST`), allocationNote.
- **BankingService** — id, name, code (M&A, ECM, DCM, Leveraged Finance,
  Restructuring, Private Capital, Financial Advisory, Strategic Advisory,
  Valuation, Other).
- **DealEvent** — dealId, type (`STAGE_CHANGE | VALUE_CHANGE |
  PARTICIPANT_ADDED | RISK_FLAGGED | MILESTONE | NOTE`), previousValue,
  newValue, occurredAt, sourceEmailId?, aiExtractionId? — powers the
  Deal Timeline.

### Deal object — full field list (`Deal` model)

id, organizationId, projectCodename, clientId, companyId (target/subject
company), sectorId, geography, bankingServiceId, dealType (enum, §6 of
PRODUCT_SPEC), side (`BUY_SIDE | SELL_SIDE | N_A`), valueMinorUnits,
currency, enterpriseValueMinorUnits, equityValueMinorUnits, workflowId,
currentStageId, previousStageId, mandateStatus (`NOT_MANDATED | MANDATED |
CO_MANDATED | LOST`), probabilityPercent, leadBankerId, createdAt,
lastActivityAt, lastMeaningfulActivityAt? (Phase 4 — inactivity-tracking
anchor, distinct from `lastActivityAt`), nextMilestone, nextMilestoneDate,
expectedCloseDate, priority (`LOW | MEDIUM | HIGH | CRITICAL`), riskStatus
(`ON_TRACK | WATCH | AT_RISK`), riskNote? (the human-readable signal
behind `riskStatus`, e.g. what the pipeline's risk-detection stage matched
— Phase 3), aiConfidencePercent (rolling confidence in the record's
current AI-maintained fields).

Relations: `client`, `company`, `sector`, `bankingService`, `workflow`,
`currentStage`, `previousStage`, `leadBanker`, `team[]` (DealTeamMember),
`participants[]` (DealParticipant), `tasks[]`, `documents[]`, `meetings[]`,
`events[]`, `aiExtractions[]`, `opportunities[]` (if the deal originated
from one), `risks[]`, `valuationObservations[]`, `inactivityException?`
(Phase 4).

### Email intelligence

Full pipeline behavior that reads/writes these tables:
`PHASE3_EMAIL_INTELLIGENCE.md`. Real Gmail/Microsoft 365 connection and
sync fields (Phase 5): `PHASE5_REAL_EMAIL_INTEGRATION.md`. Automatic
scheduled sync and per-message retry (Phase 5B):
`PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md`.

- **EmailAccount** — organizationId, userId, provider (`GMAIL |
  OUTLOOK`), emailAddress, connectionStatus (`CONNECTED | NEEDS_REAUTH |
  DISCONNECTED`), scopesGranted, lastSyncedAt. *Phase 5*:
  providerAccountId? (the provider's own stable account id — `null` only
  for the seeded Demo Mode row, set by every real OAuth connection;
  `@@unique([provider, providerAccountId])` prevents the same real mailbox
  attaching to two organizations/users), accessTokenEncrypted?/
  refreshTokenEncrypted? (AES-256-GCM, never plaintext), tokenExpiresAt?,
  syncCursor? (provider-native steady-state cursor — Gmail historyId /
  Graph delta link), initialSyncCompleted (bool), initialSyncWindowDays
  (default 90), lastSuccessfulSyncAt?, connectionError?, activeSyncJobId?
  (unique FK — the single-flight sync guard).
- **EmailThread** — emailAccountId, providerThreadId, subject,
  participantSummary, dealId? (matched), clientId?, lastMessageAt.
- **Email** — threadId, providerMessageId, fromAddress, toAddresses[],
  ccAddresses[], subject, bodyText, receivedAt, relevance (`IB_RELEVANT |
  POSSIBLY_RELEVANT | NOT_RELEVANT`), relevanceScore, processingStatus
  (`PENDING | PROCESSING | PROCESSED | PROCESSING_FAILED` — Phase 3;
  `PENDING` is the "Run Scan" backlog), processingError?, processedAt?,
  processingJobId?. *Phase 5B*: processingAttempts (Int, default 0) — how
  many times the sync engine has attempted this message; a
  `PROCESSING_FAILED` row is retried on the next sync up to
  `MAX_PROCESSING_ATTEMPTS` (3, `src/lib/email/sync-engine.ts`), then left
  alone rather than retried forever against a message that will never
  succeed. Distinct from dedup: a message's `Email` row existing no longer
  means "skip it," only `processingAttempts` reaching the cap does.
- **EmailAttachment** — emailId, filename, mimeType, sizeBytes,
  storageRef.
- **EmailParticipant** *(Phase 3)* — emailId, address, name?, role (`FROM |
  TO | CC | BCC`), contactId? (resolved `Contact`), bankerId? (resolved
  `User`) — the strongest signal client/deal matching uses.
- **EmailClassification** *(Phase 3)* — emailId (unique), label (same enum
  as `Email.relevance`), confidence (0–1), reason, promptVersion,
  createdAt. `Email.relevance`/`relevanceScore` stay denormalized for fast
  reads; this is the durable, versioned "why."
- **EmailProcessingJob** *(Phase 3)* — id, displayId (unique, e.g.
  `SCAN-20260824-001` for a Demo Mode scan, `SYNC-20260824-001` for a real
  sync — Phase 5), organizationId, status (`QUEUED | RUNNING | COMPLETED |
  FAILED`), triggeredById?, stage? (current pipeline stage name),
  totalEmails/processedCount/relevantCount/dealsUpdated/tasksCreated/
  opportunitiesCreated/risksDetected/suggestionsForReview (all Int),
  errorMessage?, startedAt?, finishedAt?, createdAt. One row per "Run Scan"
  invocation (Demo Mode, organization-wide) or, as of Phase 5, one
  `runAccountSync()` invocation for a single connected mailbox — the unit
  of observability and retry either way. *Phase 5*: emailAccountId?
  (`null` for a Demo Mode scan), syncType? (`INITIAL | INCREMENTAL`, `null`
  for Demo Mode), messagesFetched/messagesFailed/messagesSkipped (Int),
  resumeCursor? (the provider pagination token to resume a bounded sync
  from on the next invocation).
- **EmailProcessingLog** *(Phase 3)* — jobId, emailId?, stage, level, message,
  createdAt. Metadata-only (never full email bodies/tokens/credentials).

### AI extraction & evidence
- **AiExtraction** — emailId, dealId? (matched deal, nullable pre-match),
  extractedFields (JSON, validated against `ExtractionResultSchema` before
  the row is written — Phase 3 §3), confidencePercent, matchType
  (`EXISTING_DEAL | NEW_DEAL_EXISTING_CLIENT | NEW_CLIENT |
  POTENTIAL_OPPORTUNITY | UNKNOWN`), appliedStatus (`AUTO_APPLIED |
  SUGGESTED_PENDING | ACCEPTED | REJECTED | INFO_ONLY`), promptVersion?,
  processingJobId? (Phase 3 — non-null only for rows the live pipeline
  wrote, distinguishing them from Phase 1's historical backfill rows),
  createdAt. One row per detected change (not per email) — see
  ARCHITECTURE.md §2.13.
- **AiExtractionEvidence** — extractionId, emailId, quotedExcerpt,
  senderName, sentAt — what renders in the evidence popover/dialog.
- **IntelligenceEvent** — organizationId, category (`DEAL_CHANGE |
  CLIENT_ACTIVITY | TASK | OPPORTUNITY | RISK | IMPORTANT_EMAIL`),
  eventType? (finer-grained `IntelligenceEventType` — Phase 3, e.g.
  `DEAL_VALUE_CHANGED`/`STAGE_CHANGED`/`RISK_DETECTED`; maps many-to-one
  onto `category`), dealId?, clientId?, headline, detail?,
  deltaFrom?/deltaTo?, confidencePercent?, sourceEmailId?, aiExtractionId?,
  processingJobId?, reviewStatus (`NEW | REVIEWED | DISMISSED`),
  occurredAt, createdAt. Backs the Intelligence Feed and dashboard
  "Today's Intelligence"/"Since Your Last Scan" as first-class rows (not a
  computed view) so Mark-reviewed/Dismiss and Accept/Reject have something
  to persist against. Added in Phase 1 alongside the live database — see
  ARCHITECTURE.md §2.8.

### Deal intelligence (Phase 4)

Full engine behavior that reads/writes these tables:
`PHASE4_DEAL_INTELLIGENCE.md`.

- **Risk** — organizationId, dealId, riskType (`CLIENT_SILENCE |
  BUYER_CONCERN | VALUATION_PRESSURE | TIMELINE_DELAY |
  FINANCING_UNCERTAINTY | DILIGENCE_ISSUE | COMPETITIVE_PRESSURE |
  MANAGEMENT_CONCERN | DEAL_STALL | UNRESPONSIVE_COUNTERPARTY | OTHER`),
  description, confidencePercent, severity (`LOW | MEDIUM | HIGH |
  CRITICAL`), sourceEmailId?, intelligenceEventId? (unique — one Risk per
  originating event), status (`OPEN | ACKNOWLEDGED | DISMISSED |
  RESOLVED` — named `RiskItemStatus`, distinct from `Deal.riskStatus`'s
  own `RiskStatus` enum to avoid a naming collision), resolutionNote?,
  detectedAt, updatedAt.
- **DealValuationObservation** — dealId, valueMinorUnits (BigInt),
  currency, observationType (`SELLER_EXPECTATION | BUYER_INDICATION |
  INDICATIVE_BID | FINAL_BID | AGREED_VALUE`), source, sourceEmailId?,
  confidencePercent, observedAt, createdAt — one row per material
  valuation figure encountered, not just the deal's current value, so a
  deal has a real valuation history/trend.
- **InactivityException** — dealId (unique), reason?, ignoredUntil?,
  createdById?, createdAt — a banker-settable "ignore inactivity" flag;
  `runInactivityScan()` skips exempt deals entirely.
- **Briefing** — organizationId, userId, type (`MORNING | EVENING`), date
  (`@db.Date`), summary (Json — structured counts), content (Json —
  structured sections: priorities/dealAdvancements/risks/deadlines/
  opportunities/recommendedActions/narrative), sourceEventIds (String[] —
  every `IntelligenceEvent.id` a material statement traces back to),
  generatedAt, model, promptVersion, status (`GENERATED | FAILED`).
  `@@unique([organizationId, userId, type, date])` — one briefing per
  banker per day per type, generated once and stored, not regenerated on
  every read.

`IntelligenceEvent` gains `importanceScore Int?` — the deterministic 0-100
score `createIntelligenceEvent()` computes at write time (never an AI
call, never left null on a genuinely-created event — see
`PHASE4_DEAL_INTELLIGENCE.md` §1). `Deal` gains
`lastMeaningfulActivityAt DateTime?` — a dedicated inactivity-tracking
column, distinct from the pre-existing `lastActivityAt`, bumped only at
specific write sites (never by, e.g., an irrelevant email). `Notification`
gains `priority` (`CRITICAL | HIGH | MEDIUM | LOW`, default `MEDIUM`) and
`dismissedAt DateTime?`.

### Work
- **Task** — organizationId, dealId?, clientId?, title, description,
  ownerId, priority, dueDate, status (`TODO | IN_PROGRESS | COMPLETED |
  DISMISSED`), sourceEmailId?, aiConfidencePercent?, deadlineSourceText?
  (Phase 3 — the original phrase, e.g. "by Friday", distinct from the
  normalized `dueDate`), createdAt.
- **Document** — dealId, name, category, storageRef, uploadedById,
  createdAt.
- **Meeting** — dealId, title, startsAt, endsAt, attendees[], location,
  sourceEmailId?.
- **Opportunity** — organizationId, clientId, potentialService
  (BankingService), signalText, confidencePercent, recommendedAction,
  status (`NEW | ACKNOWLEDGED | CONVERTED_TO_DEAL | DISMISSED`),
  sourceEmailId, createdAt.

### Platform
- **Notification** — userId, type, title, body, readAt, linkHref,
  priority (`CRITICAL | HIGH | MEDIUM | LOW`, Phase 4 — set from the
  triggering `IntelligenceEvent.importanceScore`), dismissedAt? (Phase 4),
  createdAt.
- **AuditLog** — organizationId, actorUserId?, action, entityType,
  entityId, metadata (JSON), createdAt — every AI auto-apply and every
  Accept/Reject also writes here.

## Relationship diagram (textual)

```
Organization 1—* OrganizationMember *—1 User
Organization 1—* Client 1—* Deal *—1 Company (target)
Deal *—1 BankingService
Deal *—1 DealWorkflow 1—* DealStageDefinition
Deal 1—* DealParticipant *—1 Company
Deal 1—* DealTeamMember *—1 User
Deal 1—* DealEvent
Deal 1—* Task
Deal 1—* AiExtraction 1—* AiExtractionEvidence
EmailAccount 1—* EmailThread 1—* Email 1—* EmailAttachment
Email 1—* AiExtraction
Client 1—* Opportunity
Deal 1—* IntelligenceEvent   (also Client 1—*, Email 1—*, AiExtraction 1—*)
Email 1—* EmailParticipant *—0..1 Contact / User
Email 1—0..1 EmailClassification
EmailProcessingJob 1—* Email (processed by), 1—* EmailProcessingLog
Deal 1—* Risk 0..1—1 IntelligenceEvent   (also 0..1—1 Email)
Deal 1—* DealValuationObservation
Deal 0..1—1 InactivityException
Organization 1—* Briefing *—1 User
```

## Reproducing the database

```bash
npx prisma migrate dev   # applies prisma/migrations/ to DATABASE_URL
npx tsx prisma/seed.ts   # truncates app tables, then repopulates everything
# equivalently: npm run db:seed (after migrating)
```

`prisma/seed.ts` is idempotent — it truncates all application tables before
inserting, so re-running it always produces the same dataset (10 clients,
20 companies, 25 deals, 203 emails, 50+ intelligence events, 40+ tasks,
100+ timeline events). It reuses `src/lib/data/fixtures/*` for six
hand-curated "hero" deals (Falcon, Atlas, Orion, Phoenix, Everest, Apollo)
and generates the rest programmatically via `prisma/seed/` helpers (seeded
RNG, a 20-company pool, email/task content templates). Of the 203 emails,
~112 are pre-processed narrative history (`processingStatus: PROCESSED`);
the remaining ~91 (`prisma/seed/backlog.ts`) are seeded `PENDING` — the
unprocessed mailbox **Run Scan** (`PHASE3_EMAIL_INTELLIGENCE.md`) actually
works through, including the Phase 4 demo scenarios (Falcon stage
advancement, Orion's $390M→$420M valuation increase, Atlas inactivity —
see `PHASE4_DEAL_INTELLIGENCE.md` §15). Reseeding therefore also resets
the scan backlog to pristine.

## Why Prisma 7 specifics matter here

Prisma 7 generates an ESM client (`generator client { provider =
"prisma-client" }`) into `src/generated/prisma` and requires an explicit
driver adapter (`@prisma/adapter-pg`) — there is no bundled query engine
binary being auto-selected the way Prisma 5/6 worked. `prisma.config.ts`
(not `package.json`) drives the CLI. This is documented here because it is
a frequent source of stale assumptions when generating code against this
schema.
