-- Business exclusivity: one claim per business (see BusinessClaim in schema.prisma),
-- and the owner of a manual opt-out entry.

-- CreateEnum
CREATE TYPE "BusinessClaimStatus" AS ENUM ('RESERVED', 'PITCHED', 'RELEASED');

-- AlterTable
ALTER TABLE "opt_outs" ADD COLUMN     "createdByUserId" TEXT;

-- CreateTable
CREATE TABLE "business_claims" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "BusinessClaimStatus" NOT NULL DEFAULT 'RESERVED',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_claims_businessId_key" ON "business_claims"("businessId");

-- CreateIndex
CREATE INDEX "business_claims_userId_idx" ON "business_claims"("userId");

-- CreateIndex
CREATE INDEX "business_claims_status_expiresAt_idx" ON "business_claims"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "opt_outs_createdByUserId_idx" ON "opt_outs"("createdByUserId");

-- AddForeignKey
ALTER TABLE "business_claims" ADD CONSTRAINT "business_claims_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_claims" ADD CONSTRAINT "business_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "whatsapp_messages_phoneNumber_createdAt_idx" ON "whatsapp_messages"("phoneNumber", "createdAt");
