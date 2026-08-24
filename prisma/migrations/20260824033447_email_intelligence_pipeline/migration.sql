-- CreateEnum
CREATE TYPE "EmailProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'PROCESSING_FAILED');

-- CreateEnum
CREATE TYPE "EmailParticipantRole" AS ENUM ('FROM', 'TO', 'CC', 'BCC');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntelligenceEventType" AS ENUM ('DEAL_CREATED', 'DEAL_VALUE_CHANGED', 'STAGE_CHANGED', 'BUYER_ADDED', 'BUYER_REMOVED', 'MANDATE_CHANGED', 'DEADLINE_DETECTED', 'TASK_CREATED', 'RISK_DETECTED', 'OPPORTUNITY_DETECTED', 'CLIENT_ACTIVITY', 'IMPORTANT_EMAIL', 'DEAL_INACTIVE');

-- AlterTable
ALTER TABLE "ai_extractions" ADD COLUMN     "processingJobId" TEXT,
ADD COLUMN     "promptVersion" TEXT;

-- AlterTable
ALTER TABLE "deal_events" ADD COLUMN     "confidencePercent" INTEGER;

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "processingJobId" TEXT,
ADD COLUMN     "processingStatus" "EmailProcessingStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "intelligence_events" ADD COLUMN     "eventType" "IntelligenceEventType",
ADD COLUMN     "processingJobId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "deadlineSourceText" TEXT;

-- CreateTable
CREATE TABLE "email_participants" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT,
    "role" "EmailParticipantRole" NOT NULL,
    "contactId" TEXT,
    "bankerId" TEXT,

    CONSTRAINT "email_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_classifications" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "label" "EmailRelevance" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_processing_jobs" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "triggeredById" TEXT,
    "stage" TEXT,
    "totalEmails" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "relevantCount" INTEGER NOT NULL DEFAULT 0,
    "dealsUpdated" INTEGER NOT NULL DEFAULT 0,
    "tasksCreated" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesCreated" INTEGER NOT NULL DEFAULT 0,
    "risksDetected" INTEGER NOT NULL DEFAULT 0,
    "suggestionsForReview" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_processing_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "emailId" TEXT,
    "stage" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_processing_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_participants_emailId_idx" ON "email_participants"("emailId");

-- CreateIndex
CREATE INDEX "email_participants_address_idx" ON "email_participants"("address");

-- CreateIndex
CREATE UNIQUE INDEX "email_classifications_emailId_key" ON "email_classifications"("emailId");

-- CreateIndex
CREATE UNIQUE INDEX "email_processing_jobs_displayId_key" ON "email_processing_jobs"("displayId");

-- CreateIndex
CREATE INDEX "email_processing_jobs_organizationId_idx" ON "email_processing_jobs"("organizationId");

-- CreateIndex
CREATE INDEX "email_processing_logs_jobId_idx" ON "email_processing_logs"("jobId");

-- CreateIndex
CREATE INDEX "emails_processingStatus_idx" ON "emails"("processingStatus");

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "email_processing_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_participants" ADD CONSTRAINT "email_participants_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_participants" ADD CONSTRAINT "email_participants_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_participants" ADD CONSTRAINT "email_participants_bankerId_fkey" FOREIGN KEY ("bankerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_classifications" ADD CONSTRAINT "email_classifications_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_processing_jobs" ADD CONSTRAINT "email_processing_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_processing_jobs" ADD CONSTRAINT "email_processing_jobs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_processing_logs" ADD CONSTRAINT "email_processing_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "email_processing_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_processing_logs" ADD CONSTRAINT "email_processing_logs_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
