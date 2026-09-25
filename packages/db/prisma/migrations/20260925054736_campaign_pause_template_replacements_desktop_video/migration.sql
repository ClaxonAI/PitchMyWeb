-- AlterEnum
ALTER TYPE "CreditOutcome" ADD VALUE 'REPLACED';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "messageTemplate" TEXT,
ADD COLUMN     "sendingPaused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "demo_recordings" ADD COLUMN     "desktopDurationMs" INTEGER,
ADD COLUMN     "desktopPosterKey" TEXT,
ADD COLUMN     "desktopSizeBytes" INTEGER,
ADD COLUMN     "desktopStorageKey" TEXT;

-- AlterTable
ALTER TABLE "lead_pipelines" ADD COLUMN     "replacedById" TEXT;

-- AlterTable
ALTER TABLE "pitch_batches" ADD COLUMN     "replacedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "secondaryCaption" TEXT,
ADD COLUMN     "secondaryMediaMimeType" TEXT,
ADD COLUMN     "secondaryMediaStorageKey" TEXT;
