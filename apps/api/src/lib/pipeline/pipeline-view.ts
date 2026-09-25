import type { PipelineStage, PrismaClient } from "@pitchmyweb/db";
import { DomainError, NotFoundError } from "../errors";
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

/**
 * Bound on the batch history one campaign's progress view loads. A campaign
 * pitched in dozens of small batches shows its recent ones rather than
 * growing an unbounded response.
 */
const MAX_BATCHES = 50;

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

/**
 * One row per "send N pitches" action on this campaign, newest first — the
 * read model behind the batch progress UI ("9 of 12 resolved: 7 sent, 2
 * failed, 3 still working").
 *
 * requestedCount and reservedCount are deliberately both exposed and are
 * deliberately different numbers: the first is what the user asked for, the
 * second is what there turned out to be eligible leads and credits for. A
 * user who asks for 15 and gets 11 is owed that explanation, and only
 * reservedCount ever cost them anything.
 *
 * `processing` is derived rather than stored: it is the reserved slots whose
 * credit is not yet resolved either way, which is exactly how many pitches
 * are still in flight. Stage counts come from one grouped query over all of
 * this campaign's batches, not one query per batch.
 */
export async function listCampaignBatches(db: PrismaClient, userId: string, campaignId: string) {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  // Same reason every other read model here does it: a delivery receipt that
  // arrived while nobody was looking should be reflected in these counts.
  await syncDeliveries(db, { campaignId: campaign.id });

  const batches = await db.pitchBatch.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "desc" },
    take: MAX_BATCHES,
  });
  if (batches.length === 0) return { items: [] };

  const stageGroups = await db.leadPipeline.groupBy({
    by: ["batchId", "stage"],
    where: { batchId: { in: batches.map((batch) => batch.id) } },
    _count: { _all: true },
  });
  const stagesByBatch = new Map<string, StageCounts>();
  for (const group of stageGroups) {
    if (group.batchId === null) continue;
    const counts = stagesByBatch.get(group.batchId) ?? emptyCounts();
    counts[group.stage] = group._count._all;
    stagesByBatch.set(group.batchId, counts);
  }

  return {
    items: batches.map((batch) => ({
      id: batch.id,
      mode: batch.mode,
      status: batch.status,
      requestedCount: batch.requestedCount,
      reservedCount: batch.reservedCount,
      sentCount: batch.sentCount,
      failedCount: batch.failedCount,
      refundedCount: batch.refundedCount,
      replacedCount: batch.replacedCount,
      processingCount: Math.max(0, batch.reservedCount - batch.sentCount - batch.failedCount),
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      stages: stagesByBatch.get(batch.id) ?? emptyCounts(),
    })),
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
      select: { id: true, status: true, durationMs: true, sizeBytes: true, failureReason: true, expiresAt: true, updatedAt: true },
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

/** The video existed but its download window closed and it was (or is about to be) deleted. */
export class VideoExpiredError extends DomainError {
  constructor() {
    super("This demo video has expired. Videos can be downloaded for a limited time after they are recorded.", "VIDEO_EXPIRED", 410);
  }
}

/** True once a recording's download window has closed. */
export function isVideoExpired(recording: { expiresAt: Date | null }, now = new Date()): boolean {
  return Boolean(recording.expiresAt && recording.expiresAt.getTime() <= now.getTime());
}

/** Signed URL for the pipeline's latest ready recording (dashboard player). */
export async function getPipelineVideoUrl(
  db: PrismaClient,
  userId: string,
  pipelineId: string,
  options: { download?: boolean; view?: "phone" | "laptop"; now?: Date } = {},
): Promise<string> {
  const pipeline = await db.leadPipeline.findUnique({
    where: { id: pipelineId },
    select: { recordingId: true, campaign: { select: { userId: true } }, lead: { select: { business: { select: { name: true } } } } },
  });
  if (!pipeline || pipeline.campaign.userId !== userId || !pipeline.recordingId) {
    throw new NotFoundError("Recording", pipelineId);
  }
  const recording = await db.demoRecording.findUnique({ where: { id: pipeline.recordingId } });
  // Checked before the storage lookup: an expired video is refused even in
  // the minutes between its deadline and the sweep that deletes it.
  if (recording && (isVideoExpired(recording, options.now) || recording.failureReason === "expired")) throw new VideoExpiredError();
  const storage = getObjectStorage();
  const laptop = options.view === "laptop";
  const key = laptop ? recording?.desktopStorageKey : recording?.storageKey;
  if (!recording || recording.status !== "READY" || !key || !storage) {
    throw new NotFoundError("Recording", pipelineId);
  }
  const downloadFilename = options.download ? `${downloadBaseName(pipeline.lead.business.name)}-website-demo${laptop ? "-laptop" : "-phone"}.mp4` : undefined;
  return storage.signedGetUrl(key, RECORDING_URL_TTL_SECONDS, { downloadFilename });
}

/** Business name reduced to something safe to use as a file name. */
export function downloadBaseName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return cleaned || "demo";
}
