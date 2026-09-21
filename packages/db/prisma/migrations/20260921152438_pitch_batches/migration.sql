-- CreateEnum
CREATE TYPE "PitchBatchMode" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "PitchBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED');

-- NOTE: prisma migrate dev's auto-generated diff also proposed dropping
-- "businesses_normalizedAddress_trgm_idx" and "businesses_normalizedName_trgm_idx"
-- here, as it does on every migration that touches this schema. Removed by
-- hand, same reason as every prior migration that has hit this: gin_trgm_ops
-- isn't expressible in Prisma's schema DSL, so they aren't tracked in
-- schema.prisma and will always look like drift. Required by
-- lib/business/fuzzy-match.ts's pg_trgm similarity search.

-- AlterTable
ALTER TABLE "lead_pipelines" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "pitch_batches" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "reservedCount" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "refundedCount" INTEGER NOT NULL DEFAULT 0,
    "mode" "PitchBatchMode" NOT NULL,
    "status" "PitchBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "pitch_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pitch_batches_campaignId_idx" ON "pitch_batches"("campaignId");

-- CreateIndex
CREATE INDEX "pitch_batches_userId_createdAt_idx" ON "pitch_batches"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_pipelines_batchId_idx" ON "lead_pipelines"("batchId");

-- AddForeignKey
ALTER TABLE "lead_pipelines" ADD CONSTRAINT "lead_pipelines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "pitch_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitch_batches" ADD CONSTRAINT "pitch_batches_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitch_batches" ADD CONSTRAINT "pitch_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
