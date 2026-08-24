-- CreateEnum
CREATE TYPE "AuthProviderType" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'BANKER', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "BankingTeam" AS ENUM ('MA', 'ECM', 'DCM', 'LEVERAGED_FINANCE', 'RESTRUCTURING', 'PRIVATE_CAPITAL', 'ADVISORY');

-- CreateEnum
CREATE TYPE "ClientRelationship" AS ENUM ('ACTIVE', 'DORMANT', 'PROSPECT', 'FORMER');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('BUY_SIDE_MA', 'SELL_SIDE_MA', 'MERGER', 'ACQUISITION', 'DIVESTITURE', 'TAKE_PRIVATE', 'IPO', 'FOLLOW_ON', 'RIGHTS_ISSUE', 'CONVERTIBLE', 'BOND_ISSUANCE', 'PRIVATE_PLACEMENT', 'ACQUISITION_FINANCING', 'REFINANCING', 'LEVERAGED_BUYOUT', 'RESTRUCTURING', 'JOINT_VENTURE', 'STRATEGIC_INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DealSide" AS ENUM ('BUY_SIDE', 'SELL_SIDE', 'N_A');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('NOT_MANDATED', 'MANDATED', 'CO_MANDATED', 'LOST');

-- CreateEnum
CREATE TYPE "DealPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('ON_TRACK', 'WATCH', 'AT_RISK');

-- CreateEnum
CREATE TYPE "DealParticipantRole" AS ENUM ('BUYER', 'SELLER', 'INVESTOR', 'LENDER', 'LAW_FIRM', 'ACCOUNTANT', 'TARGET', 'ADVISOR_OTHER');

-- CreateEnum
CREATE TYPE "DealTeamRole" AS ENUM ('LEAD_BANKER', 'MD', 'VP', 'ASSOCIATE', 'ANALYST');

-- CreateEnum
CREATE TYPE "DealEventType" AS ENUM ('STAGE_CHANGE', 'VALUE_CHANGE', 'PARTICIPANT_ADDED', 'RISK_FLAGGED', 'MILESTONE', 'NOTE');

-- CreateEnum
CREATE TYPE "EmailProviderType" AS ENUM ('GMAIL', 'OUTLOOK');

-- CreateEnum
CREATE TYPE "EmailConnectionStatus" AS ENUM ('CONNECTED', 'NEEDS_REAUTH', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "EmailRelevance" AS ENUM ('IB_RELEVANT', 'POSSIBLY_RELEVANT', 'NOT_RELEVANT');

-- CreateEnum
CREATE TYPE "DealMatchType" AS ENUM ('EXISTING_DEAL', 'NEW_DEAL_EXISTING_CLIENT', 'NEW_CLIENT', 'POTENTIAL_OPPORTUNITY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ExtractionAppliedStatus" AS ENUM ('AUTO_APPLIED', 'SUGGESTED_PENDING', 'ACCEPTED', 'REJECTED', 'INFO_ONLY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'CONVERTED_TO_DEAL', 'DISMISSED');

-- CreateEnum
CREATE TYPE "IntelligenceCategory" AS ENUM ('DEAL_CHANGE', 'CLIENT_ACTIVITY', 'TASK', 'OPPORTUNITY', 'RISK', 'IMPORTANT_EMAIL');

-- CreateEnum
CREATE TYPE "IntelligenceReviewStatus" AS ENUM ('NEW', 'REVIEWED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "authProvider" "AuthProviderType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'BANKER',
    "team" "BankingTeam",
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationshipStatus" "ClientRelationship" NOT NULL DEFAULT 'PROSPECT',
    "sectorId" TEXT,
    "primaryBankerId" TEXT,
    "headquarters" TEXT,
    "website" TEXT,
    "foundedYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sectorId" TEXT,
    "description" TEXT,
    "website" TEXT,
    "isClientEntity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isKeyContact" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banking_services" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "banking_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_workflows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "bankingServiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "deal_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_stage_definitions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "deal_stage_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectCodename" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "targetCompanyId" TEXT,
    "sectorId" TEXT,
    "geography" TEXT,
    "bankingServiceId" TEXT NOT NULL,
    "dealType" "DealType" NOT NULL,
    "side" "DealSide" NOT NULL DEFAULT 'N_A',
    "valueMinorUnits" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "enterpriseValueMinorUnits" BIGINT,
    "equityValueMinorUnits" BIGINT,
    "workflowId" TEXT NOT NULL,
    "currentStageId" TEXT NOT NULL,
    "previousStageId" TEXT,
    "mandateStatus" "MandateStatus" NOT NULL DEFAULT 'NOT_MANDATED',
    "probabilityPercent" INTEGER,
    "leadBankerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextMilestone" TEXT,
    "nextMilestoneDate" TIMESTAMP(3),
    "expectedCloseDate" TIMESTAMP(3),
    "priority" "DealPriority" NOT NULL DEFAULT 'MEDIUM',
    "riskStatus" "RiskStatus" NOT NULL DEFAULT 'ON_TRACK',
    "aiConfidencePercent" INTEGER,
    "originatingOpportunityId" TEXT,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_participants" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "DealParticipantRole" NOT NULL,

    CONSTRAINT "deal_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_team_members" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DealTeamRole" NOT NULL,
    "allocationNote" TEXT,

    CONSTRAINT "deal_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_events" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "DealEventType" NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceEmailId" TEXT,
    "aiExtractionId" TEXT,
    "note" TEXT,

    CONSTRAINT "deal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "EmailProviderType" NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "connectionStatus" "EmailConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "scopesGranted" TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "providerThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "participantSummary" TEXT,
    "dealId" TEXT,
    "clientId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "relevance" "EmailRelevance" NOT NULL DEFAULT 'NOT_RELEVANT',
    "relevanceScore" DOUBLE PRECISION,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageRef" TEXT NOT NULL,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_extractions" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "dealId" TEXT,
    "extractedFields" JSONB NOT NULL,
    "confidencePercent" INTEGER NOT NULL,
    "matchType" "DealMatchType" NOT NULL,
    "appliedStatus" "ExtractionAppliedStatus" NOT NULL DEFAULT 'INFO_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_extraction_evidence" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "quotedExcerpt" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_extraction_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealId" TEXT,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "priority" "DealPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "sourceEmailId" TEXT,
    "aiConfidencePercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "storageRef" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "attendees" TEXT[],
    "location" TEXT,
    "sourceEmailId" TEXT,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "potentialServiceId" TEXT NOT NULL,
    "signalText" TEXT NOT NULL,
    "confidencePercent" INTEGER NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "sourceEmailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkHref" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" "IntelligenceCategory" NOT NULL,
    "dealId" TEXT,
    "clientId" TEXT,
    "headline" TEXT NOT NULL,
    "detail" TEXT,
    "deltaFrom" TEXT,
    "deltaTo" TEXT,
    "confidencePercent" INTEGER,
    "sourceEmailId" TEXT,
    "aiExtractionId" TEXT,
    "reviewStatus" "IntelligenceReviewStatus" NOT NULL DEFAULT 'NEW',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_organizationId_idx" ON "organization_members"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sectors_name_key" ON "sectors"("name");

-- CreateIndex
CREATE INDEX "clients_organizationId_idx" ON "clients"("organizationId");

-- CreateIndex
CREATE INDEX "companies_organizationId_idx" ON "companies"("organizationId");

-- CreateIndex
CREATE INDEX "contacts_clientId_idx" ON "contacts"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "banking_services_code_key" ON "banking_services"("code");

-- CreateIndex
CREATE INDEX "deal_workflows_bankingServiceId_idx" ON "deal_workflows"("bankingServiceId");

-- CreateIndex
CREATE INDEX "deal_stage_definitions_workflowId_idx" ON "deal_stage_definitions"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "deal_stage_definitions_workflowId_key_key" ON "deal_stage_definitions"("workflowId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "deals_originatingOpportunityId_key" ON "deals"("originatingOpportunityId");

-- CreateIndex
CREATE INDEX "deals_organizationId_idx" ON "deals"("organizationId");

-- CreateIndex
CREATE INDEX "deals_clientId_idx" ON "deals"("clientId");

-- CreateIndex
CREATE INDEX "deals_currentStageId_idx" ON "deals"("currentStageId");

-- CreateIndex
CREATE INDEX "deal_participants_dealId_idx" ON "deal_participants"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "deal_team_members_dealId_userId_key" ON "deal_team_members"("dealId", "userId");

-- CreateIndex
CREATE INDEX "deal_events_dealId_idx" ON "deal_events"("dealId");

-- CreateIndex
CREATE INDEX "email_accounts_organizationId_idx" ON "email_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_userId_emailAddress_key" ON "email_accounts"("userId", "emailAddress");

-- CreateIndex
CREATE INDEX "email_threads_dealId_idx" ON "email_threads"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_emailAccountId_providerThreadId_key" ON "email_threads"("emailAccountId", "providerThreadId");

-- CreateIndex
CREATE INDEX "emails_threadId_idx" ON "emails"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "emails_threadId_providerMessageId_key" ON "emails"("threadId", "providerMessageId");

-- CreateIndex
CREATE INDEX "email_attachments_emailId_idx" ON "email_attachments"("emailId");

-- CreateIndex
CREATE INDEX "ai_extractions_emailId_idx" ON "ai_extractions"("emailId");

-- CreateIndex
CREATE INDEX "ai_extractions_dealId_idx" ON "ai_extractions"("dealId");

-- CreateIndex
CREATE INDEX "ai_extraction_evidence_extractionId_idx" ON "ai_extraction_evidence"("extractionId");

-- CreateIndex
CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");

-- CreateIndex
CREATE INDEX "tasks_dealId_idx" ON "tasks"("dealId");

-- CreateIndex
CREATE INDEX "documents_dealId_idx" ON "documents"("dealId");

-- CreateIndex
CREATE INDEX "meetings_dealId_idx" ON "meetings"("dealId");

-- CreateIndex
CREATE INDEX "opportunities_organizationId_idx" ON "opportunities"("organizationId");

-- CreateIndex
CREATE INDEX "opportunities_clientId_idx" ON "opportunities"("clientId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "intelligence_events_organizationId_idx" ON "intelligence_events"("organizationId");

-- CreateIndex
CREATE INDEX "intelligence_events_dealId_idx" ON "intelligence_events"("dealId");

-- CreateIndex
CREATE INDEX "intelligence_events_clientId_idx" ON "intelligence_events"("clientId");

-- CreateIndex
CREATE INDEX "intelligence_events_category_idx" ON "intelligence_events"("category");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_workflows" ADD CONSTRAINT "deal_workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_workflows" ADD CONSTRAINT "deal_workflows_bankingServiceId_fkey" FOREIGN KEY ("bankingServiceId") REFERENCES "banking_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_definitions" ADD CONSTRAINT "deal_stage_definitions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "deal_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_bankingServiceId_fkey" FOREIGN KEY ("bankingServiceId") REFERENCES "banking_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "deal_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "deal_stage_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_previousStageId_fkey" FOREIGN KEY ("previousStageId") REFERENCES "deal_stage_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadBankerId_fkey" FOREIGN KEY ("leadBankerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_originatingOpportunityId_fkey" FOREIGN KEY ("originatingOpportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_participants" ADD CONSTRAINT "deal_participants_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_participants" ADD CONSTRAINT "deal_participants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_team_members" ADD CONSTRAINT "deal_team_members_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_team_members" ADD CONSTRAINT "deal_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_aiExtractionId_fkey" FOREIGN KEY ("aiExtractionId") REFERENCES "ai_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extraction_evidence" ADD CONSTRAINT "ai_extraction_evidence_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "ai_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_potentialServiceId_fkey" FOREIGN KEY ("potentialServiceId") REFERENCES "banking_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_events" ADD CONSTRAINT "intelligence_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_events" ADD CONSTRAINT "intelligence_events_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_events" ADD CONSTRAINT "intelligence_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_events" ADD CONSTRAINT "intelligence_events_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_events" ADD CONSTRAINT "intelligence_events_aiExtractionId_fkey" FOREIGN KEY ("aiExtractionId") REFERENCES "ai_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
