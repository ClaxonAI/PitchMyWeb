-- CreateEnum
CREATE TYPE "WebsiteVerificationStatus" AS ENUM ('UNVERIFIED', 'LIVE', 'PARKED', 'DEAD', 'UNREACHABLE');

-- NOTE: prisma migrate dev's auto-generated diff also proposed dropping
-- "businesses_normalizedAddress_trgm_idx" and "businesses_normalizedName_trgm_idx"
-- here. Removed by hand, same reason as 20260918020356_remove_webhook_delivery:
-- these are hand-written raw SQL (gin_trgm_ops isn't expressible in Prisma's
-- schema DSL) so they aren't tracked in schema.prisma and every future
-- migrate dev diff will keep proposing to drop them as "drift." They are
-- required by lib/business/fuzzy-match.ts's pg_trgm similarity search.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "websiteVerificationStatus" "WebsiteVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "websiteVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "businesses_websiteVerificationStatus_websiteVerifiedAt_idx" ON "businesses"("websiteVerificationStatus", "websiteVerifiedAt");
