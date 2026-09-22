-- Business.phoneType: the libphonenumber line type of the business's phone
-- number (MOBILE / FIXED_LINE / FIXED_LINE_OR_MOBILE / UNKNOWN, or NULL when
-- the number does not parse at all), recorded at ingest by
-- lib/business/normalize.ts. Validity itself already lived in
-- "normalizedPhone" (the parsed E.164 form), so this adds the one fact that
-- was missing: whether the number is the kind WhatsApp can reach. Nullable
-- with no default and no backfill in this migration — existing rows are
-- classified by prisma/backfill-phone-type.ts, and lib/leads/phone.ts treats
-- NULL on an otherwise-valid number as pitchable so an un-backfilled
-- database behaves exactly as it did before this shipped.

-- NOTE: prisma migrate dev's auto-generated diff also proposed dropping
-- "businesses_normalizedAddress_trgm_idx" and "businesses_normalizedName_trgm_idx"
-- here, as it does on every migration touching this schema. Removed by
-- hand, same reason as every prior one: gin_trgm_ops isn't expressible in
-- Prisma's schema DSL, so they aren't tracked in schema.prisma and will
-- always look like drift. Required by lib/business/fuzzy-match.ts's
-- pg_trgm similarity search.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "phoneType" TEXT;

-- CreateIndex
CREATE INDEX "businesses_phoneType_idx" ON "businesses"("phoneType");
