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
lastActivityAt, nextMilestone, nextMilestoneDate, expectedCloseDate,
priority (`LOW | MEDIUM | HIGH | CRITICAL`), riskStatus (`ON_TRACK |
WATCH | AT_RISK`), riskNote? (the human-readable signal behind
`riskStatus`, e.g. what the pipeline's risk-detection stage matched —
Phase 3), aiConfidencePercent (rolling confidence in the record's
current AI-maintained fields).

Relations: `client`, `company`, `sector`, `bankingService`, `workflow`,
`currentStage`, `previousStage`, `leadBanker`, `team[]` (DealTeamMember),
`participants[]` (DealParticipant), `tasks[]`, `documents[]`, `meetings[]`,
`events[]`, `aiExtractions[]`, `opportunities[]` (if the deal originated
from one).

### Email intelligence

Full pipeline behavior that reads/writes these tables:
`PHASE3_EMAIL_INTELLIGENCE.md`.

- **EmailAccount** — organizationId, userId, provider (`GMAIL |
  OUTLOOK`), emailAddress, connectionStatus, scopesGranted, lastSyncedAt.
- **EmailThread** — emailAccountId, providerThreadId, subject,
  participantSummary, dealId? (matched), clientId?, lastMessageAt.
- **Email** — threadId, providerMessageId, fromAddress, toAddresses[],
  ccAddresses[], subject, bodyText, receivedAt, relevance (`IB_RELEVANT |
  POSSIBLY_RELEVANT | NOT_RELEVANT`), relevanceScore, processingStatus
  (`PENDING | PROCESSING | PROCESSED | PROCESSING_FAILED` — Phase 3;
  `PENDING` is the "Run Scan" backlog), processingError?, processedAt?,
  processingJobId?.
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
  `SCAN-20260824-001`), organizationId, status (`QUEUED | RUNNING |
  COMPLETED | FAILED`), triggeredById?, stage? (current pipeline stage
  name), totalEmails/processedCount/relevantCount/dealsUpdated/
  tasksCreated/opportunitiesCreated/risksDetected/suggestionsForReview
  (all Int), errorMessage?, startedAt?, finishedAt?, createdAt. One row per
  "Run Scan" invocation — the unit of observability and retry.
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
```

## Reproducing the database

```bash
npx prisma migrate dev   # applies prisma/migrations/ to DATABASE_URL
npx tsx prisma/seed.ts   # truncates app tables, then repopulates everything
# equivalently: npm run db:seed (after migrating)
```

`prisma/seed.ts` is idempotent — it truncates all application tables before
inserting, so re-running it always produces the same dataset (10 clients,
20 companies, 25 deals, 202 emails, 50+ intelligence events, 40+ tasks,
100+ timeline events). It reuses `src/lib/data/fixtures/*` for six
hand-curated "hero" deals (Falcon, Atlas, Orion, Phoenix, Everest, Apollo)
and generates the rest programmatically via `prisma/seed/` helpers (seeded
RNG, a 20-company pool, email/task content templates). Of the 202 emails,
~112 are pre-processed narrative history (`processingStatus: PROCESSED`);
the remaining ~90 (`prisma/seed/backlog.ts`) are seeded `PENDING` — the
unprocessed mailbox **Run Scan** (`PHASE3_EMAIL_INTELLIGENCE.md`) actually
works through. Reseeding therefore also resets the scan backlog to
pristine.

## Why Prisma 7 specifics matter here

Prisma 7 generates an ESM client (`generator client { provider =
"prisma-client" }`) into `src/generated/prisma` and requires an explicit
driver adapter (`@prisma/adapter-pg`) — there is no bundled query engine
binary being auto-selected the way Prisma 5/6 worked. `prisma.config.ts`
(not `package.json`) drives the CLI. This is documented here because it is
a frequent source of stale assumptions when generating code against this
schema.
