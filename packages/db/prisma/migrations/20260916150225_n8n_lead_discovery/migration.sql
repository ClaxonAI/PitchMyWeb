-- AlterTable
ALTER TABLE "campaign_executions" ADD COLUMN     "externalRunId" TEXT,
ADD COLUMN     "ingestLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'demo',
ADD COLUMN     "triggeredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "executionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_idempotencyKey_key" ON "webhook_deliveries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "webhook_deliveries_executionId_idx" ON "webhook_deliveries"("executionId");

-- CreateIndex
CREATE INDEX "campaign_executions_status_triggeredAt_idx" ON "campaign_executions"("status", "triggeredAt");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "campaign_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
