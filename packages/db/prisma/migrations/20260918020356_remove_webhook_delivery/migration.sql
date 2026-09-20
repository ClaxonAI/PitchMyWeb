/*
  Warnings:

  - You are about to drop the `webhook_deliveries` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "webhook_deliveries_executionId_fkey";

-- DropTable
DROP TABLE "webhook_deliveries";

-- NOTE: prisma migrate dev's auto-generated diff also proposed dropping
-- "businesses_normalizedAddress_trgm_idx" and "businesses_normalizedName_trgm_idx"
-- here. Those statements were removed by hand: the two indexes are hand-written
-- raw SQL from 20260917161729_phase2_business_dedup (Prisma's schema DSL can't
-- express gin_trgm_ops), so they aren't tracked in schema.prisma and Prisma's
-- diff sees them as drift to reconcile away. They are still required by
-- lib/business/fuzzy-match.ts's pg_trgm similarity search — dropping them would
-- silently make every fuzzy dedup candidate search sequential-scan.
