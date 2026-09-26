-- Pitches send one video, the laptop walkthrough; the phone recording is gone.

-- Recordings that have a laptop video keep it as their one video. The phone
-- files they replace are deleted by the maintenance job's storage cleanup
-- (see its legacy "-laptop.mp4" clause), not left behind in the bucket.
UPDATE "demo_recordings"
SET "storageKey" = "desktopStorageKey",
    "posterKey" = "desktopPosterKey",
    "durationMs" = "desktopDurationMs",
    "sizeBytes" = "desktopSizeBytes"
WHERE "desktopStorageKey" IS NOT NULL;

ALTER TABLE "demo_recordings" DROP COLUMN "desktopStorageKey",
DROP COLUMN "desktopPosterKey",
DROP COLUMN "desktopDurationMs",
DROP COLUMN "desktopSizeBytes";

-- Pitches still waiting to go out send the laptop video instead of the phone one.
UPDATE "whatsapp_messages"
SET "mediaStorageKey" = "secondaryMediaStorageKey",
    "mediaMimeType" = COALESCE("secondaryMediaMimeType", "mediaMimeType")
WHERE "secondaryMediaStorageKey" IS NOT NULL AND "status" IN ('QUEUED', 'SENDING');

ALTER TABLE "whatsapp_messages" DROP COLUMN "secondaryMediaStorageKey",
DROP COLUMN "secondaryMediaMimeType",
DROP COLUMN "secondaryCaption";

-- Campaigns saved with the old default message promised two videos; say one.
UPDATE "campaigns"
SET "messageTemplate" = REPLACE("messageTemplate", 'I''ve attached two short videos of it — one on a phone, one on a laptop.', 'I''ve attached a short video of it on a laptop screen.')
WHERE "messageTemplate" LIKE '%two short videos of it — one on a phone, one on a laptop.%';

-- Pitches not yet sent carry that sentence in their body too.
UPDATE "whatsapp_messages"
SET "body" = REPLACE("body", 'I''ve attached two short videos of it — one on a phone, one on a laptop.', 'I''ve attached a short video of it on a laptop screen.')
WHERE "status" IN ('QUEUED', 'SENDING') AND "body" LIKE '%two short videos of it — one on a phone, one on a laptop.%';
