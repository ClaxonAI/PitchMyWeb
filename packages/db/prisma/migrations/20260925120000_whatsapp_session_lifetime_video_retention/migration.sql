-- WhatsApp session lifetime and demo-video retention.
--
-- whatsapp_accounts: a linked number is now signed out once the campaign
-- that needed it has finished, unless the user opted in to staying linked
-- for 3 days (apps/api/src/lib/whatsapp/session-policy.ts). "linkedAt"
-- anchors "a campaign finished after this login"; "stayLinkedUntil" is the
-- opt-in window; "logoutReason" says why the system signed it out.
--
-- demo_recordings: videos are downloadable for VIDEO_RETENTION_DAYS (7 by
-- default) after they become READY, then deleted from object storage by the
-- pipeline-maintenance job. "expiresAt" is that deadline.
--
-- NOTE: as with every migration here, the gin_trgm_ops indexes on
-- businesses are left alone even though `prisma migrate dev` proposes
-- dropping them (they are not expressible in schema.prisma).

-- AlterTable
ALTER TABLE "whatsapp_accounts" ADD COLUMN     "linkedAt" TIMESTAMP(3),
ADD COLUMN     "stayLinkedUntil" TIMESTAMP(3),
ADD COLUMN     "logoutReason" TEXT;

-- AlterTable
ALTER TABLE "demo_recordings" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "demo_recordings_expiresAt_idx" ON "demo_recordings"("expiresAt");

-- Backfill: a number that is already linked starts its session now, so it
-- gets the same grace period a fresh link would rather than being signed out
-- by the first sweep after this ships.
UPDATE "whatsapp_accounts"
SET "linkedAt" = NOW()
WHERE "status" IN ('CONNECTED', 'RECONNECTING', 'CONNECTING', 'QR_READY', 'PAIRING_CODE_READY', 'ERROR');

-- Backfill: existing videos get the default 7-day window from when they
-- were last written (for a READY recording, that is when it became READY).
-- Anything older than that is deleted from storage by the next sweep.
UPDATE "demo_recordings"
SET "expiresAt" = "updatedAt" + INTERVAL '7 days'
WHERE "status" = 'READY' AND "storageKey" IS NOT NULL AND "expiresAt" IS NULL;
