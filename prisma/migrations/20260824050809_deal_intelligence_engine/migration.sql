-- CreateEnum
CREATE TYPE "RiskType" AS ENUM ('CLIENT_SILENCE', 'BUYER_CONCERN', 'VALUATION_PRESSURE', 'TIMELINE_DELAY', 'FINANCING_UNCERTAINTY', 'DILIGENCE_ISSUE', 'COMPETITIVE_PRESSURE', 'MANAGEMENT_CONCERN', 'DEAL_STALL', 'UNRESPONSIVE_COUNTERPARTY', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskItemStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ValuationObservationType" AS ENUM ('SELLER_EXPECTATION', 'BUYER_INDICATION', 'INDICATIVE_BID', 'FINAL_BID', 'AGREED_VALUE');

-- CreateEnum
CREATE TYPE "BriefingType" AS ENUM ('MORNING', 'EVENING');

-- CreateEnum
CREATE TYPE "BriefingStatus" AS ENUM ('GENERATED', 'FAILED');

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "lastMeaningfulActivityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "intelligence_events" ADD COLUMN     "importanceScore" INTEGER;

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "riskType" "RiskType" NOT NULL,
    "description" TEXT NOT NULL,
    "confidencePercent" INTEGER NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "sourceEmailId" TEXT,
    "intelligenceEventId" TEXT,
    "status" "RiskItemStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_valuation_observations" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "valueMinorUnits" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "observationType" "ValuationObservationType" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEmailId" TEXT,
    "confidencePercent" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_valuation_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inactivity_exceptions" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "reason" TEXT,
    "ignoredUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inactivity_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BriefingType" NOT NULL,
    "date" DATE NOT NULL,
    "summary" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "sourceEventIds" TEXT[],
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "BriefingStatus" NOT NULL DEFAULT 'GENERATED',

    CONSTRAINT "briefings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risks_intelligenceEventId_key" ON "risks"("intelligenceEventId");

-- CreateIndex
CREATE INDEX "risks_organizationId_idx" ON "risks"("organizationId");

-- CreateIndex
CREATE INDEX "risks_dealId_idx" ON "risks"("dealId");

-- CreateIndex
CREATE INDEX "risks_status_idx" ON "risks"("status");

-- CreateIndex
CREATE INDEX "deal_valuation_observations_dealId_idx" ON "deal_valuation_observations"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "inactivity_exceptions_dealId_key" ON "inactivity_exceptions"("dealId");

-- CreateIndex
CREATE INDEX "briefings_organizationId_idx" ON "briefings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "briefings_organizationId_userId_type_date_key" ON "briefings"("organizationId", "userId", "type", "date");

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_intelligenceEventId_fkey" FOREIGN KEY ("intelligenceEventId") REFERENCES "intelligence_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_valuation_observations" ADD CONSTRAINT "deal_valuation_observations_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_valuation_observations" ADD CONSTRAINT "deal_valuation_observations_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inactivity_exceptions" ADD CONSTRAINT "inactivity_exceptions_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inactivity_exceptions" ADD CONSTRAINT "inactivity_exceptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
