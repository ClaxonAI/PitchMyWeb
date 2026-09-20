-- CreateEnum
CREATE TYPE "PossibleDuplicateStatus" AS ENUM ('PENDING', 'CONFIRMED_MERGED', 'DISMISSED');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "normalizedAddress" TEXT,
ADD COLUMN     "normalizedDomain" TEXT,
ADD COLUMN     "normalizedName" TEXT,
ADD COLUMN     "normalizedPhone" TEXT;

-- CreateTable
CREATE TABLE "business_sources" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceBusinessId" TEXT,
    "sourceUrl" TEXT,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "possible_duplicates" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "matchedFields" JSONB NOT NULL,
    "status" "PossibleDuplicateStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "possible_duplicates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_merges" (
    "id" TEXT NOT NULL,
    "winnerBusinessId" TEXT NOT NULL,
    "loserBusinessId" TEXT NOT NULL,
    "resolvedBy" TEXT NOT NULL,
    "reason" TEXT,
    "possibleDuplicateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_merges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_sources_businessId_idx" ON "business_sources"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "business_sources_source_sourceBusinessId_key" ON "business_sources"("source", "sourceBusinessId");

-- CreateIndex
CREATE INDEX "possible_duplicates_status_idx" ON "possible_duplicates"("status");

-- CreateIndex
CREATE INDEX "possible_duplicates_businessId_idx" ON "possible_duplicates"("businessId");

-- CreateIndex
CREATE INDEX "possible_duplicates_candidateId_idx" ON "possible_duplicates"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "business_merges_possibleDuplicateId_key" ON "business_merges"("possibleDuplicateId");

-- CreateIndex
CREATE INDEX "business_merges_winnerBusinessId_idx" ON "business_merges"("winnerBusinessId");

-- CreateIndex
CREATE INDEX "business_merges_loserBusinessId_idx" ON "business_merges"("loserBusinessId");

-- CreateIndex
CREATE INDEX "businesses_normalizedPhone_idx" ON "businesses"("normalizedPhone");

-- CreateIndex
CREATE INDEX "businesses_normalizedDomain_idx" ON "businesses"("normalizedDomain");

-- CreateIndex
CREATE INDEX "businesses_normalizedName_idx" ON "businesses"("normalizedName");

-- CreateIndex
CREATE INDEX "businesses_mergedIntoId_idx" ON "businesses"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_sources" ADD CONSTRAINT "business_sources_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_merges" ADD CONSTRAINT "business_merges_winnerBusinessId_fkey" FOREIGN KEY ("winnerBusinessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_merges" ADD CONSTRAINT "business_merges_loserBusinessId_fkey" FOREIGN KEY ("loserBusinessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_merges" ADD CONSTRAINT "business_merges_possibleDuplicateId_fkey" FOREIGN KEY ("possibleDuplicateId") REFERENCES "possible_duplicates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 2 dedup engine (hand-written, not Prisma-generated): trigram fuzzy
-- matching support and the canonical-pair uniqueness constraint, neither of
-- which Prisma's schema DSL can express.

-- Enables similarity()/word_similarity() for fuzzy name/address matching
-- (lib/business/fuzzy-match.ts).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes so fuzzy candidate search doesn't sequential-scan.
CREATE INDEX "businesses_normalizedName_trgm_idx" ON "businesses" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX "businesses_normalizedAddress_trgm_idx" ON "businesses" USING gin ("normalizedAddress" gin_trgm_ops);

-- The same unordered pair of businesses can never be flagged twice,
-- regardless of which one ends up stored as businessId vs candidateId.
-- Application code (lib/business/dedupe.ts) also checks both orderings
-- before inserting and treats a P2002 here as "already flagged" — this
-- index is the backstop against a race between two concurrent ingestions.
CREATE UNIQUE INDEX "possible_duplicates_canonical_pair_idx" ON "possible_duplicates" (
  LEAST("businessId", "candidateId"),
  GREATEST("businessId", "candidateId")
);

-- Default fuzzy-match threshold/weights, read by
-- lib/settings/settings.service.ts::getDedupeFuzzyConfig(). Idempotent.
INSERT INTO "settings" (id, key, value, description, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'dedupe.fuzzyThreshold',
  '{"threshold": 0.72, "weights": {"name": 0.45, "address": 0.30, "phone": 0.15, "domain": 0.10}}'::jsonb,
  'Business dedup: fuzzy-match score threshold and component weights (weights must sum to 1.0).',
  now(),
  now()
)
ON CONFLICT (key) DO NOTHING;
