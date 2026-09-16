-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebsiteRequirement" AS ENUM ('ANY', 'WITH_WEBSITE', 'WITHOUT_WEBSITE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ANALYZED', 'SITE_READY', 'PITCHED', 'REPLIED', 'INTERESTED', 'NEGOTIATING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ScoreClassification" AS ENUM ('EXCELLENT', 'STRONG', 'MEDIUM', 'LOW', 'IGNORE');

-- CreateEnum
CREATE TYPE "ServiceCode" AS ENUM ('WEBSITE', 'WEBSITE_REDESIGN', 'WHATSAPP', 'REVIEWS', 'SEO', 'AI_CHATBOT', 'AI_VOICE_AGENT', 'APPOINTMENT_SYSTEM', 'DIGITAL_MENU', 'POS');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "PitchStatus" AS ENUM ('PENDING', 'GENERATED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'OTHER');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('PENDING', 'LINK_GENERATED', 'OPENED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LEAD_CREATED', 'LEAD_ANALYZED', 'WEBSITE_GENERATED', 'DEMO_PUBLISHED', 'PITCH_GENERATED', 'WHATSAPP_OPENED', 'PITCHED', 'REPLIED', 'INTERESTED', 'MEETING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'NEGOTIATING', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "radius" INTEGER,
    "category" TEXT NOT NULL,
    "minRating" DOUBLE PRECISION,
    "minReviews" INTEGER,
    "websiteRequirement" "WebsiteRequirement" NOT NULL DEFAULT 'ANY',
    "leadLimit" INTEGER NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "recommendedService" "ServiceCode",
    "estimatedDealMin" INTEGER,
    "estimatedDealMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewVolume" INTEGER NOT NULL,
    "websiteGap" INTEGER NOT NULL,
    "socialPresence" INTEGER NOT NULL,
    "contactAvailability" INTEGER NOT NULL,
    "businessValue" INTEGER NOT NULL,
    "localDemand" INTEGER NOT NULL,
    "dataQuality" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "classification" "ScoreClassification" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_projects" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "theme" TEXT,
    "contentJSON" JSONB NOT NULL,
    "designJSON" JSONB,
    "demoUrl" TEXT,
    "publishedUrl" TEXT,
    "status" "WebsiteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_versions" (
    "id" TEXT NOT NULL,
    "websiteProjectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "theme" TEXT,
    "contentJSON" JSONB NOT NULL,
    "designJSON" JSONB,
    "demoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pitches" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" "PitchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pitches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "pitchId" TEXT,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'WHATSAPP',
    "status" "OutreachStatus" NOT NULL DEFAULT 'PENDING',
    "whatsappUrl" TEXT,
    "openedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" "ServiceCode" NOT NULL,
    "description" TEXT,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "campaigns_userId_idx" ON "campaigns"("userId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "businesses_category_idx" ON "businesses"("category");

-- CreateIndex
CREATE INDEX "businesses_city_idx" ON "businesses"("city");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_source_externalId_key" ON "businesses"("source", "externalId");

-- CreateIndex
CREATE INDEX "leads_businessId_idx" ON "leads"("businessId");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_score_idx" ON "leads"("score");

-- CreateIndex
CREATE UNIQUE INDEX "leads_campaignId_businessId_key" ON "leads"("campaignId", "businessId");

-- CreateIndex
CREATE INDEX "lead_scores_leadId_idx" ON "lead_scores"("leadId");

-- CreateIndex
CREATE INDEX "website_projects_leadId_idx" ON "website_projects"("leadId");

-- CreateIndex
CREATE INDEX "website_projects_status_idx" ON "website_projects"("status");

-- CreateIndex
CREATE INDEX "website_versions_websiteProjectId_idx" ON "website_versions"("websiteProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "website_versions_websiteProjectId_versionNumber_key" ON "website_versions"("websiteProjectId", "versionNumber");

-- CreateIndex
CREATE INDEX "pitches_leadId_idx" ON "pitches"("leadId");

-- CreateIndex
CREATE INDEX "outreach_leadId_idx" ON "outreach"("leadId");

-- CreateIndex
CREATE INDEX "outreach_pitchId_idx" ON "outreach"("pitchId");

-- CreateIndex
CREATE INDEX "activities_leadId_idx" ON "activities"("leadId");

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- CreateIndex
CREATE INDEX "activities_createdAt_idx" ON "activities"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deals_leadId_key" ON "deals"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "services_code_key" ON "services"("code");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_projects" ADD CONSTRAINT "website_projects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_versions" ADD CONSTRAINT "website_versions_websiteProjectId_fkey" FOREIGN KEY ("websiteProjectId") REFERENCES "website_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_pitchId_fkey" FOREIGN KEY ("pitchId") REFERENCES "pitches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
