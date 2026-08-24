-- CreateEnum
CREATE TYPE "EmailSyncType" AS ENUM ('INITIAL', 'INCREMENTAL');

-- AlterTable
ALTER TABLE "email_accounts" ADD COLUMN     "accessTokenEncrypted" TEXT,
ADD COLUMN     "activeSyncJobId" TEXT,
ADD COLUMN     "connectionError" TEXT,
ADD COLUMN     "initialSyncCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "initialSyncWindowDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN     "providerAccountId" TEXT,
ADD COLUMN     "refreshTokenEncrypted" TEXT,
ADD COLUMN     "syncCursor" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "email_processing_jobs" ADD COLUMN     "emailAccountId" TEXT,
ADD COLUMN     "messagesFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messagesFetched" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messagesSkipped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resumeCursor" TEXT,
ADD COLUMN     "syncType" "EmailSyncType";

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_activeSyncJobId_key" ON "email_accounts"("activeSyncJobId");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_provider_providerAccountId_key" ON "email_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "email_processing_jobs_emailAccountId_idx" ON "email_processing_jobs"("emailAccountId");

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_activeSyncJobId_fkey" FOREIGN KEY ("activeSyncJobId") REFERENCES "email_processing_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_processing_jobs" ADD CONSTRAINT "email_processing_jobs_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

