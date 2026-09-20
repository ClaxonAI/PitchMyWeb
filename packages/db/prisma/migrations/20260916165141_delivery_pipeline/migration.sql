-- CreateEnum
CREATE TYPE "SelectionMode" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('AUTO', 'DIRECT');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('SELECTED', 'BUILDING_SITE', 'SITE_PUBLISHED', 'RECORDING', 'VIDEO_UPLOADED', 'DELIVERY_QUEUED', 'LINK_READY', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('QUEUED', 'RECORDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "WaMediaKind" AS ENUM ('VIDEO');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "selectionMode" "SelectionMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "targetCount" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "website_projects" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "mediaKind" "WaMediaKind",
ADD COLUMN     "mediaMimeType" TEXT,
ADD COLUMN     "mediaStorageKey" TEXT;

-- CreateTable
CREATE TABLE "lead_pipelines" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL DEFAULT 'SELECTED',
    "failureStage" "PipelineStage",
    "failureReason" TEXT,
    "websiteProjectId" TEXT,
    "recordingId" TEXT,
    "whatsappMessageId" TEXT,
    "whatsappUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_recordings" (
    "id" TEXT NOT NULL,
    "websiteProjectId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "pipelineId" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "posterKey" TEXT,
    "durationMs" INTEGER,
    "sizeBytes" INTEGER,
    "mimeType" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_pipelines_campaignId_stage_idx" ON "lead_pipelines"("campaignId", "stage");

-- CreateIndex
CREATE INDEX "lead_pipelines_stage_updatedAt_idx" ON "lead_pipelines"("stage", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_pipelines_campaignId_leadId_key" ON "lead_pipelines"("campaignId", "leadId");

-- CreateIndex
CREATE INDEX "demo_recordings_websiteProjectId_status_idx" ON "demo_recordings"("websiteProjectId", "status");

-- CreateIndex
CREATE INDEX "demo_recordings_status_createdAt_idx" ON "demo_recordings"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "lead_pipelines" ADD CONSTRAINT "lead_pipelines_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_pipelines" ADD CONSTRAINT "lead_pipelines_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_recordings" ADD CONSTRAINT "demo_recordings_websiteProjectId_fkey" FOREIGN KEY ("websiteProjectId") REFERENCES "website_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_recordings" ADD CONSTRAINT "demo_recordings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
