-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "lead_analyses" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "AiAnalysisStatus" NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "repairUsed" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "websiteNeed" INTEGER,
    "whatsappNeed" INTEGER,
    "reviewAutomationNeed" INTEGER,
    "voiceAgentNeed" INTEGER,
    "recommendedService" "ServiceCode",
    "estimatedDealMin" INTEGER,
    "estimatedDealMax" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_analyses_leadId_idx" ON "lead_analyses"("leadId");

-- AddForeignKey
ALTER TABLE "lead_analyses" ADD CONSTRAINT "lead_analyses_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
