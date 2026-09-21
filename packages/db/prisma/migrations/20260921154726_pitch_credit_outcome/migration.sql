-- CreateEnum
CREATE TYPE "CreditOutcome" AS ENUM ('CONSUMED', 'REFUNDED');

-- NOTE: prisma migrate dev's auto-generated diff also proposed dropping
-- "businesses_normalizedAddress_trgm_idx" and "businesses_normalizedName_trgm_idx"
-- here, as it does on every migration touching this schema. Removed by
-- hand, same reason as every prior one: gin_trgm_ops isn't expressible in
-- Prisma's schema DSL, so they aren't tracked in schema.prisma and will
-- always look like drift. Required by lib/business/fuzzy-match.ts's
-- pg_trgm similarity search.

-- AlterTable
ALTER TABLE "lead_pipelines" ADD COLUMN     "creditOutcome" "CreditOutcome",
ADD COLUMN     "creditResolvedAt" TIMESTAMP(3);
