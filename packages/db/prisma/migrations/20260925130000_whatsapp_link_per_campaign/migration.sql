-- WhatsApp is linked per campaign, with no opt-out: the "keep me signed in
-- for 3 days" option is gone, so its window column goes too. A number still
-- inside such a window is signed out by the next session-policy sweep once
-- none of its campaigns is sending (apps/api/src/lib/whatsapp/session-policy.ts).
--
-- NOTE: as with every migration here, the gin_trgm_ops indexes on
-- businesses are left alone even though `prisma migrate dev` proposes
-- dropping them (they are not expressible in schema.prisma).

-- AlterTable
ALTER TABLE "whatsapp_accounts" DROP COLUMN "stayLinkedUntil";
