-- CreateEnum
CREATE TYPE "PitchCreditLedgerType" AS ENUM ('PURCHASE', 'FREE_GRANT', 'RESERVE', 'RELEASE', 'CONSUME', 'REFUND');

-- NOTE: prisma migrate dev's auto-generated diff also proposed dropping
-- "businesses_normalizedAddress_trgm_idx" and "businesses_normalizedName_trgm_idx"
-- here. Removed by hand, same reason as every prior migration that has hit
-- this (20260918020356_remove_webhook_delivery, 20260918063832_website_
-- verification): these are hand-written raw SQL (gin_trgm_ops isn't
-- expressible in Prisma's schema DSL) so they aren't tracked in
-- schema.prisma and every future migrate dev diff will keep proposing to
-- drop them as "drift." They are required by
-- lib/business/fuzzy-match.ts's pg_trgm similarity search.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pitch_wallets" (
    "userId" TEXT NOT NULL,
    "availableCredits" INTEGER NOT NULL DEFAULT 0,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pitch_wallets_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "pitch_credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT,
    "pipelineId" TEXT,
    "orderId" TEXT,
    "type" "PitchCreditLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pitch_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pitch_credit_ledger_referenceId_key" ON "pitch_credit_ledger"("referenceId");

-- CreateIndex
CREATE INDEX "pitch_credit_ledger_userId_createdAt_idx" ON "pitch_credit_ledger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_recommendedService_idx" ON "leads"("recommendedService");

-- CreateIndex
CREATE INDEX "leads_campaignId_recommendedService_idx" ON "leads"("campaignId", "recommendedService");

-- AddForeignKey
ALTER TABLE "pitch_wallets" ADD CONSTRAINT "pitch_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitch_credit_ledger" ADD CONSTRAINT "pitch_credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
