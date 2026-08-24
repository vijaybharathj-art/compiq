-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN     "notifyDailyDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyDealChanges" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyRiskAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyTaskReminders" BOOLEAN NOT NULL DEFAULT true;
