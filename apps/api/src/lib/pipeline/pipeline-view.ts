import type { PipelineStage, PrismaClient } from "@pitchmyweb/db";
import { NotFoundError } from "../errors";
import { loadOwnedCampaign } from "../campaigns/campaign.service";
import { getObjectStorage, RECORDING_URL_TTL_SECONDS } from "../storage";
import { syncDeliveries } from "./pipeline.service";

// Read models for the campaign dashboard.

const STAGES: PipelineStage[] = [
  "SELECTED",
  "BUILDING_SITE",
  "SITE_PUBLISHED",
  "RECORDING",
  "VIDEO_UPLOADED",
  "DELIVERY_QUEUED",
  "LINK_READY",
  "SENT",
  "FAILED",
];

export type StageCounts = Record<PipelineStage, number>;

function emptyCounts(): StageCounts {
  return Object.fromEntries(STAGES.map((stage) => [stage, 0])) as StageCounts;
}

export async function getCampaignOverview(db: PrismaClient, userId: string, campaignId: string) {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  await syncDeliveries(db, { campaignId: campaign.id });

  const [execution, leadCount, stageGroups, whatsappAccount] = await Promise.all([
    db.campaignExecution.findFirst({
      where: { campaignId: campaign.id },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        provider: true,
        businessesFound: true,
        leadsCreated: true,
        failedCount: true,
        errorMessage: true,
        startedAt: true,
        triggeredAt: true,
        completedAt: true,
      },
    }),
    db.lead.count({ where: { campaignId: campaign.id } }),
    db.leadPipeline.groupBy({ by: ["stage"], where: { campaignId: campaign.id }, _count: { _all: true } }),
    db.whatsAppAccount.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, phoneNumber: true },
    }),
  ]);

  const stages = emptyCounts();
  for (const group of stageGroups) stages[group.stage] = group._count._all;
  const selected = Object.values(stages).reduce((sum, count) => sum + count, 0);

  return {
    campaign,
    execution,
    counts: {
      leads: leadCount,
      selected,
      stages,
      delivered: stages.SENT,
    },
    whatsapp: whatsappAccount,
  };
}

export async function listCampaignPipelines(db: PrismaClient, userId: string, campaignId: string) {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  await syncDeliveries(db, { campaignId: campaign.id });

  const pipelines = await db.leadPipeline.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "asc" },
    include: {
      lead: {
        select: {
          id: true,
          status: true,
          score: true,
          business: { select: { name: true, city: true, phone: true, rating: true, reviewCount: true } },
          pitches: { where: { status: "GENERATED" }, orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
        },
      },
    },
  });

  const projectIds = pipelines.map((p) => p.websiteProjectId).filter((id): id is string => Boolean(id));
  const recordingIds = pipelines.map((p) => p.recordingId).filter((id): id is string => Boolean(id));
  const messageIds = pipelines.map((p) => p.whatsappMessageId).filter((id): id is string => Boolean(id));

  const [projects, recordings, messages] = await Promise.all([
    db.websiteProject.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, slug: true, publishedUrl: true, expiresAt: true, status: true },
    }),
    db.demoRecording.findMany({
      where: { id: { in: recordingIds } },
      select: { id: true, status: true, durationMs: true, sizeBytes: true, failureReason: true, updatedAt: true },
    }),
    db.whatsAppMessage.findMany({
      where: { id: { in: messageIds } },
      select: { id: true, status: true, queuedAt: true, sentAt: true, deliveredAt: true, readAt: true, failureReason: true },
    }),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const recordingById = new Map(recordings.map((r) => [r.id, r]));
  const messageById = new Map(messages.map((m) => [m.id, m]));

  return {
    deliveryMode: campaign.deliveryMode,
    items: pipelines.map((pipeline) => ({
      id: pipeline.id,
      stage: pipeline.stage,
      failureStage: pipeline.failureStage,
      failureReason: pipeline.failureReason,
      attempts: pipeline.attempts,
      whatsappUrl: pipeline.whatsappUrl,
      createdAt: pipeline.createdAt,
      updatedAt: pipeline.updatedAt,
      lead: {
        id: pipeline.lead.id,
        status: pipeline.lead.status,
        score: pipeline.lead.score,
        business: pipeline.lead.business,
      },
      pitch: pipeline.lead.pitches[0]?.content ?? null,
      website: pipeline.websiteProjectId ? projectById.get(pipeline.websiteProjectId) ?? null : null,
      recording: pipeline.recordingId ? recordingById.get(pipeline.recordingId) ?? null : null,
      message: pipeline.whatsappMessageId ? messageById.get(pipeline.whatsappMessageId) ?? null : null,
    })),
  };
}

/** Signed URL for the pipeline's latest ready recording (dashboard player). */
export async function getPipelineVideoUrl(db: PrismaClient, userId: string, pipelineId: string, options: { download?: boolean } = {}): Promise<string> {
  const pipeline = await db.leadPipeline.findUnique({
    where: { id: pipelineId },
    select: { recordingId: true, campaign: { select: { userId: true } }, lead: { select: { business: { select: { name: true } } } } },
  });
  if (!pipeline || pipeline.campaign.userId !== userId || !pipeline.recordingId) {
    throw new NotFoundError("Recording", pipelineId);
  }
  const recording = await db.demoRecording.findUnique({ where: { id: pipeline.recordingId } });
  const storage = getObjectStorage();
  if (!recording || recording.status !== "READY" || !recording.storageKey || !storage) {
    throw new NotFoundError("Recording", pipelineId);
  }
  const downloadFilename = options.download ? `${downloadBaseName(pipeline.lead.business.name)}-website-demo.mp4` : undefined;
  return storage.signedGetUrl(recording.storageKey, RECORDING_URL_TTL_SECONDS, { downloadFilename });
}

/** Business name reduced to something safe to use as a file name. */
export function downloadBaseName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return cleaned || "demo";
}
