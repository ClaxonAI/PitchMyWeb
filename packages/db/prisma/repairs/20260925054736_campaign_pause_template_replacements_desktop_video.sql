-- Finishes 20260925054736_campaign_pause_template_replacements_desktop_video
-- where it failed part-way (production, 2026-09-25, two deploys running at
-- once). The same changes as the migration, each skipped if already there.
-- Applied by infrastructure/aws/repair-migrations.sh only while the migration
-- is recorded as failed.
ALTER TYPE "CreditOutcome" ADD VALUE IF NOT EXISTS 'REPLACED';

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "messageTemplate" TEXT,
ADD COLUMN IF NOT EXISTS "sendingPaused" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "demo_recordings" ADD COLUMN IF NOT EXISTS "desktopDurationMs" INTEGER,
ADD COLUMN IF NOT EXISTS "desktopPosterKey" TEXT,
ADD COLUMN IF NOT EXISTS "desktopSizeBytes" INTEGER,
ADD COLUMN IF NOT EXISTS "desktopStorageKey" TEXT;

ALTER TABLE "lead_pipelines" ADD COLUMN IF NOT EXISTS "replacedById" TEXT;

ALTER TABLE "pitch_batches" ADD COLUMN IF NOT EXISTS "replacedCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "secondaryCaption" TEXT,
ADD COLUMN IF NOT EXISTS "secondaryMediaMimeType" TEXT,
ADD COLUMN IF NOT EXISTS "secondaryMediaStorageKey" TEXT;
