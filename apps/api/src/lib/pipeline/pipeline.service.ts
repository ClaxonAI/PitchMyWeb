import type { LeadPipeline, PipelineStage, Prisma, PrismaClient } from "@pitchmyweb/db";
import { buildPreviewContent } from "@pitchmyweb/templates";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "../errors";
import { isLeadTransitionAllowed, transitionLeadStatus } from "../leads/lifecycle";
import { isPitchableBusiness } from "../leads/phone";
import { generateWhatsAppAction } from "../leads/whatsapp.service";
import { emitEvent } from "../observability/events";
import { createWebsiteProject, publishWebsiteProject } from "../websites/website.service";
import { enqueueMessage, OutreachBlockedError } from "../whatsapp/message.service";
import { consumeReservedCredit, refundReservedCredit } from "../checkout/wallet.service";
import { BUSINESS_NAME_PLACEHOLDER, directMessage, fallbackPitch, FALLBACK_PITCH_PROMPT_VERSION, fillMessageTemplate, previewExpiry, videoPageUrl } from "./links";
import { enqueueRecording } from "./recording-queue";

// The delivery pipeline (docs/pipeline.md). One LeadPipeline row per selected
// lead; this module is the only writer of its stage:
//
//   SELECTED -> BUILDING_SITE -> SITE_PUBLISHED -> RECORDING -> VIDEO_UPLOADED
//     -> DELIVERY_QUEUED -> SENT        (Auto: video + pitch from WhatsApp)
//     -> LINK_READY      -> SENT        (Direct: user sends a wa.me link)
//
// Any step can fail; the row then records FAILED plus the stage it failed in
// and a fixed reason code, and retryPipeline() resumes from that stage.

export const PIPELINE_BUILD_CONCURRENCY = 5;

// Failed pitches are not dropped: transient failures go back in the queue
// and are retried automatically (pipeline-maintenance.job.ts), with a
// growing wait and a hard cap, so a pitch is delivered late rather than
// silently lost. Failures the user or the recipient caused are never
// retried. Both live here, not in the maintenance job, because failPipeline
// below needs them to decide — at the moment a pipeline fails, not later —
// whether its reserved credit is refunded now or stays reserved for a retry.
export const AUTO_RETRY_MAX_ATTEMPTS = 3;
export const AUTO_RETRY_BASE_DELAY_MS = 10 * 60 * 1000;
export const NON_RETRYABLE_REASONS = [
  "paused",
  "opted_out",
  "invalid_number",
  "recent_duplicate",
  // A business whose number WhatsApp cannot reach (no valid number at all,
  // or a landline) will not have gained one by the time a retry runs — the
  // classification comes from the stored Business row, not from anything
  // this attempt did. Retrying only delays the refund.
  "no_valid_phone",
  // A SENT message that never got a delivery receipt within
  // DELIVERY_RECEIPT_TIMEOUT_MS (see syncDeliveries below) is not safe to
  // blindly retry: WhatsApp may have genuinely delivered it, and a retry
  // would risk a real second send to a number that already got the first
  // one. There is no provider-side reconciliation API in this codebase to
  // check before retrying, so the safe default is to stop here and refund
  // instead — the customer gets their credit back rather than a delayed,
  // possibly-duplicate send.
  "not_delivered",
];

export type PipelineDeps = {
  enqueueRecording: (job: { recordingId: string }) => Promise<void>;
};

const defaultDeps: PipelineDeps = { enqueueRecording };

/** Stages a pipeline is still working through (not SENT, LINK_READY or FAILED). */
export const ACTIVE_STAGES: PipelineStage[] = [
  "SELECTED",
  "BUILDING_SITE",
  "SITE_PUBLISHED",
  "RECORDING",
  "VIDEO_UPLOADED",
  "DELIVERY_QUEUED",
];

/** A failure the pipeline records with its code instead of treating as a crash. */
export class PipelineStepError extends Error {
  constructor(readonly reason: string, message?: string) {
    super(message ?? reason);
    this.name = "PipelineStepError";
  }
}

// ---------------------------------------------------------------------------
// Stage bookkeeping
// ---------------------------------------------------------------------------

async function setStage(
  db: PrismaClient,
  pipeline: Pick<LeadPipeline, "id" | "campaignId" | "leadId">,
  stage: PipelineStage,
  data: Partial<Pick<LeadPipeline, "websiteProjectId" | "recordingId" | "whatsappMessageId" | "whatsappUrl">> & { incrementAttempts?: boolean } = {},
): Promise<void> {
  const { incrementAttempts, ...fields } = data;
  await db.leadPipeline.update({
    where: { id: pipeline.id },
    data: {
      ...fields,
      stage,
      failureStage: null,
      failureReason: null,
      ...(incrementAttempts ? { attempts: { increment: 1 } } : {}),
    },
  });
  emitEvent("pipeline.stage_changed", { pipelineId: pipeline.id, campaignId: pipeline.campaignId, leadId: pipeline.leadId, stage });
}

function reasonFor(error: unknown): string {
  if (error instanceof PipelineStepError) return error.reason;
  if (error instanceof OutreachBlockedError) return error.reason;
  if (error instanceof DomainError) return error.code.toLowerCase();
  return "internal_error";
}

/**
 * The one place a reservation is ever resolved — called with the pipeline's
 * *own* credit-relevant fields (never a caller's possibly-stale in-memory
 * copy) once its stage transition has already won the right to resolve it
 * (see failPipeline and the two SENT-transition call sites below, both of
 * which condition their stage-changing UPDATE on `creditOutcome IS NULL` in
 * the same transaction this runs in). `creditOutcome` here is a second,
 * independent guard on top of that: only the caller that actually flips it
 * from null goes on to touch the wallet/ledger/batch at all.
 *
 * batchId null is a historical-row case (pipelines created before this
 * column existed) — nothing to resolve, so this is a no-op.
 */
async function resolvePipelineCredit(
  tx: Prisma.TransactionClient,
  pipeline: { id: string; batchId: string | null },
  userId: string,
  outcome: "CONSUMED" | "REFUNDED",
): Promise<void> {
  if (!pipeline.batchId) return;
  const claimed = await tx.leadPipeline.updateMany({
    where: { id: pipeline.id, creditOutcome: null },
    data: { creditOutcome: outcome, creditResolvedAt: new Date() },
  });
  if (claimed.count !== 1) return;

  if (outcome === "CONSUMED") {
    await consumeReservedCredit(tx, { userId, batchId: pipeline.batchId, pipelineId: pipeline.id });
    await tx.pitchBatch.updateMany({ where: { id: pipeline.batchId, status: "PROCESSING" }, data: { sentCount: { increment: 1 } } });
  } else {
    await refundReservedCredit(tx, { userId, batchId: pipeline.batchId, pipelineId: pipeline.id });
    await tx.pitchBatch.updateMany({ where: { id: pipeline.batchId, status: "PROCESSING" }, data: { failedCount: { increment: 1 }, refundedCount: { increment: 1 } } });
  }

  // Batch completion: every reserved slot has now either sent or (finally)
  // failed. Checked here rather than as a separate follow-up step, so it
  // commits in the same transaction as the resolution that triggered it.
  const batch = await tx.pitchBatch.findUnique({
    where: { id: pipeline.batchId },
    select: { reservedCount: true, sentCount: true, failedCount: true, status: true },
  });
  if (batch && batch.status === "PROCESSING" && batch.sentCount + batch.failedCount >= batch.reservedCount) {
    await tx.pitchBatch.updateMany({ where: { id: pipeline.batchId, status: "PROCESSING" }, data: { status: "COMPLETED", completedAt: new Date() } });
  }
}

/**
 * Sets a pipeline FAILED and, if this was its last allowed attempt (or the
 * failure reason is one that is never retried), refunds its reserved credit
 * in the same transaction — the pipeline row and the wallet can never
 * disagree about whether this pitch is still "in flight." A failure that is
 * still retryable leaves the credit reserved, awaiting
 * pipeline-maintenance.job.ts's requeueFailedPipelines.
 */
async function failPipeline(
  db: PrismaClient,
  pipeline: Pick<LeadPipeline, "id" | "campaignId" | "leadId">,
  failureStage: PipelineStage,
  error: unknown,
): Promise<void> {
  const reason = reasonFor(error);
  if (!(error instanceof PipelineStepError) && !(error instanceof DomainError)) {
    console.error(`Pipeline ${pipeline.id} failed at ${failureStage}:`, error);
  }

  await db.$transaction(async (tx) => {
    // Read the *fresh* attempts count from this very write, not from the
    // `pipeline` parameter a caller may have loaded earlier: buildAndPublish
    // increments attempts via its own setStage call before it can fail, so
    // an in-memory copy taken at the top of that function would be one
    // behind the true value here — using this update's own return avoids
    // refunding one attempt too early.
    const updated = await tx.leadPipeline.update({
      where: { id: pipeline.id },
      data: { stage: "FAILED", failureStage, failureReason: reason },
      select: { attempts: true, batchId: true, campaign: { select: { userId: true } } },
    });
    const isFinal = updated.attempts >= AUTO_RETRY_MAX_ATTEMPTS || NON_RETRYABLE_REASONS.includes(reason);
    if (isFinal) {
      await resolvePipelineCredit(tx, { id: pipeline.id, batchId: updated.batchId }, updated.campaign.userId, "REFUNDED");
    }
  });

  const alert = failureStage === "DELIVERY_QUEUED" || failureStage === "VIDEO_UPLOADED";
  emitEvent(
    alert ? "delivery.failed" : "pipeline.failed",
    { pipelineId: pipeline.id, campaignId: pipeline.campaignId, leadId: pipeline.leadId, failureStage, reason },
    { level: "error", alert },
  );
}

async function loadPipeline(db: PrismaClient, pipelineId: string) {
  const pipeline = await db.leadPipeline.findUnique({
    where: { id: pipelineId },
    include: {
      campaign: { select: { id: true, userId: true, deliveryMode: true, messageTemplate: true } },
      lead: {
        include: {
          business: true,
          pitches: { where: { status: "GENERATED" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!pipeline) throw new NotFoundError("LeadPipeline", pipelineId);
  return pipeline;
}

type LoadedPipeline = Awaited<ReturnType<typeof loadPipeline>>;

async function loadOwnedPipeline(db: PrismaClient, userId: string, pipelineId: string): Promise<LoadedPipeline> {
  const pipeline = await loadPipeline(db, pipelineId).catch(() => null);
  if (!pipeline || pipeline.campaign.userId !== userId) throw new NotFoundError("LeadPipeline", pipelineId);
  return pipeline;
}

async function runPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export type StartPipelinesInput = {
  campaignId: string;
  leadIds: readonly string[];
  /**
   * The PitchBatch this selection belongs to (selection.service.ts::
   * reservePitchBatch creates it, and reserves this many credits, before
   * calling here). Every LeadPipeline this creates is tagged with it —
   * required, not optional: a pipeline created outside a reservation would
   * have no credit ever consumed or refunded for it, and there is no such
   * pipeline through any caller in this codebase.
   */
  batchId: string;
};

/**
 * Creates pipeline rows for the given leads (ignoring leads that already
 * have one in this campaign) and runs each new pipeline up to the recording
 * request. Callers validate ownership and eligibility first.
 *
 * Re-queries by `batchId` rather than by `{campaignId, leadId, stage}` to
 * find what it just created: two concurrent calls racing over an
 * overlapping leadId list can both attempt the same insert, and
 * skipDuplicates means only one of them actually wins that row. Filtering
 * by *this call's own* batchId (unique per PitchBatch, set only by the
 * winner's insert) is what makes `pipelines.length` below the true count
 * this specific call is responsible for — selection.service.ts relies on
 * exactly this to know how many of its reserved credits to release when
 * some of the requested leads turned out to already be taken.
 */
export async function startPipelines(db: PrismaClient, input: StartPipelinesInput, deps: PipelineDeps = defaultDeps): Promise<LeadPipeline[]> {
  if (input.leadIds.length === 0) return [];
  await db.leadPipeline.createMany({
    data: input.leadIds.map((leadId) => ({ campaignId: input.campaignId, leadId, batchId: input.batchId })),
    skipDuplicates: true,
  });
  const pipelines = await db.leadPipeline.findMany({ where: { batchId: input.batchId, stage: "SELECTED" } });
  await runPool(pipelines, PIPELINE_BUILD_CONCURRENCY, (pipeline) => runFromBuild(db, pipeline.id, deps));
  return db.leadPipeline.findMany({ where: { id: { in: pipelines.map((p) => p.id) } } });
}

async function runFromBuild(db: PrismaClient, pipelineId: string, deps: PipelineDeps): Promise<void> {
  const published = await buildAndPublish(db, pipelineId);
  if (published) await requestRecording(db, pipelineId, deps);
}

// ---------------------------------------------------------------------------
// Build + publish
// ---------------------------------------------------------------------------

async function ensurePitch(db: PrismaClient, pipeline: LoadedPipeline): Promise<void> {
  if (pipeline.lead.pitches.length > 0) return;
  await db.pitch.create({
    data: {
      leadId: pipeline.leadId,
      content: fallbackPitch(pipeline.lead.business.name),
      promptVersion: FALLBACK_PITCH_PROMPT_VERSION,
      modelName: "template",
      status: "GENERATED",
    },
  });
}

/** Returns true when the preview is live. Failures are recorded on the pipeline. */
export async function buildAndPublish(db: PrismaClient, pipelineId: string): Promise<boolean> {
  const pipeline = await loadPipeline(db, pipelineId);
  try {
    await setStage(db, pipeline, "BUILDING_SITE", { incrementAttempts: true });

    // The pitch queue's entry condition (and the last place it can still be
    // enforced cheaply): a lead whose number WhatsApp cannot reach fails
    // here, before a site is built for it, and Phase 3 refunds its reserved
    // credit — "no_valid_phone" is in NON_RETRYABLE_REASONS, so that refund
    // is immediate rather than after three pointless retries.
    if (!isPitchableBusiness(pipeline.lead.business)) {
      throw new PipelineStepError("no_valid_phone", "The business has no phone number WhatsApp can reach");
    }

    // Discovery already analysed the lead; record that on the lifecycle so
    // the site can move it to SITE_READY and delivery to PITCHED.
    if (pipeline.lead.status === "NEW") {
      await transitionLeadStatus(db, { leadId: pipeline.leadId, nextStatus: "ANALYZED", metadata: { source: "discovery_selection" } });
    }
    await ensurePitch(db, pipeline);

    const content = buildPreviewContent(pipeline.lead.business, {
      summary: pipeline.lead.summary,
      services: pipeline.lead.services,
    });
    const project = await createWebsiteProject(db, pipeline.campaign.userId, { leadId: pipeline.leadId, contentJSON: content });
    await publishWebsiteProject(db, pipeline.campaign.userId, project.id, { expiresAt: previewExpiry() });

    await setStage(db, pipeline, "SITE_PUBLISHED", { websiteProjectId: project.id });
    return true;
  } catch (error) {
    await failPipeline(db, pipeline, "BUILDING_SITE", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export async function requestRecording(db: PrismaClient, pipelineId: string, deps: PipelineDeps = defaultDeps): Promise<boolean> {
  const pipeline = await loadPipeline(db, pipelineId);
  try {
    if (!pipeline.websiteProjectId) throw new PipelineStepError("no_website", "No published preview to record");
    const recording = await db.demoRecording.create({
      data: { websiteProjectId: pipeline.websiteProjectId, leadId: pipeline.leadId, pipelineId: pipeline.id, status: "QUEUED" },
    });
    await setStage(db, pipeline, "RECORDING", { recordingId: recording.id });
    await deps.enqueueRecording({ recordingId: recording.id });
    return true;
  } catch (error) {
    await failPipeline(db, pipeline, "RECORDING", error);
    return false;
  }
}

export type RecordingFinishedResult = { pipelineId: string | null; stage: PipelineStage | null };

/**
 * Called (through the internal API) after apps/recorder-worker has marked a
 * recording READY or FAILED. Idempotent: a repeated call finds the pipeline
 * already past RECORDING and does nothing.
 */
export async function onRecordingFinished(db: PrismaClient, recordingId: string): Promise<RecordingFinishedResult> {
  const recording = await db.demoRecording.findUnique({ where: { id: recordingId } });
  if (!recording) throw new NotFoundError("DemoRecording", recordingId);
  if (!recording.pipelineId) return { pipelineId: null, stage: null };

  const pipeline = await db.leadPipeline.findUnique({ where: { id: recording.pipelineId } });
  if (!pipeline || pipeline.stage !== "RECORDING" || pipeline.recordingId !== recording.id) {
    return { pipelineId: pipeline?.id ?? null, stage: pipeline?.stage ?? null };
  }

  if (recording.status === "READY" && recording.storageKey) {
    const claimed = await db.leadPipeline.updateMany({
      where: { id: pipeline.id, stage: "RECORDING", recordingId: recording.id },
      data: { stage: "VIDEO_UPLOADED" },
    });
    if (claimed.count === 0) return { pipelineId: pipeline.id, stage: pipeline.stage };
    emitEvent("recording.finished", { pipelineId: pipeline.id, recordingId, status: "READY", durationMs: recording.durationMs, sizeBytes: recording.sizeBytes });
    await prepareDelivery(db, pipeline.id);
  } else if (recording.status === "FAILED") {
    emitEvent("recording.finished", { pipelineId: pipeline.id, recordingId, status: "FAILED" }, { level: "warn" });
    await failPipeline(db, pipeline, "RECORDING", new PipelineStepError(recording.failureReason ?? "recording_failed"));
  }

  const after = await db.leadPipeline.findUnique({ where: { id: pipeline.id }, select: { stage: true } });
  return { pipelineId: pipeline.id, stage: after?.stage ?? null };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export async function prepareDelivery(db: PrismaClient, pipelineId: string): Promise<void> {
  const pipeline = await loadPipeline(db, pipelineId);
  try {
    const [project, recording] = await Promise.all([
      pipeline.websiteProjectId ? db.websiteProject.findUnique({ where: { id: pipeline.websiteProjectId } }) : null,
      pipeline.recordingId ? db.demoRecording.findUnique({ where: { id: pipeline.recordingId } }) : null,
    ]);
    if (!project?.publishedUrl) throw new PipelineStepError("no_website", "The preview is not published");
    if (!recording || recording.status !== "READY" || !recording.storageKey) {
      throw new PipelineStepError("no_recording", "The walkthrough video is not ready");
    }
    const pitch = pipeline.lead.pitches[0];
    if (!pitch) throw new PipelineStepError("no_pitch", "The lead has no pitch");

    if (pipeline.campaign.deliveryMode === "DIRECT") {
      const template = (pipeline.campaign.messageTemplate ?? pitch.content).split(BUSINESS_NAME_PLACEHOLDER).join(pipeline.lead.business.name);
      const body = directMessage(template, project.publishedUrl, videoPageUrl(project.slug));
      const { whatsappUrl } = await generateWhatsAppAction(db, { leadId: pipeline.leadId, userId: pipeline.campaign.userId, body });
      await setStage(db, pipeline, "LINK_READY", { whatsappUrl });
      return;
    }

    // Never queue a second message for a pipeline that already has one in
    // flight. enqueueMessage's BullMQ dedup is keyed on the *message row's*
    // id (`send-<messageId>`), so it cannot help here: two retries of the
    // same pipeline would each create their own row and each enqueue a job
    // for it — two real WhatsApp sends to the same business. Only a message
    // that reached a dead state (the send definitively did not happen) may
    // be replaced.
    const existing = pipeline.whatsappMessageId
      ? await db.whatsAppMessage.findUnique({ where: { id: pipeline.whatsappMessageId }, select: { id: true, status: true } })
      : null;
    if (existing && !DEAD_STATUSES.has(existing.status)) {
      // Still queued, sending, or already sent/delivered — syncDeliveries
      // owns it from here. Re-assert the stage in case a retry arrived
      // while it sat in DELIVERY_QUEUED, but create nothing new.
      if (pipeline.stage !== "DELIVERY_QUEUED") {
        await setStage(db, pipeline, "DELIVERY_QUEUED", { whatsappMessageId: existing.id });
      }
      return;
    }

    const account = await db.whatsAppAccount.findFirst({
      where: { userId: pipeline.campaign.userId, status: "CONNECTED" },
      orderBy: { lastConnectedAt: "desc" },
      select: { id: true },
    });
    if (!account) throw new PipelineStepError("whatsapp_not_connected", "Link a WhatsApp account to send automatically");

    const message = await enqueueMessage(
      db,
      pipeline.campaign.userId,
      {
        accountId: account.id,
        // The validated E.164 number, not the provider's raw string: both
        // end up as digits, but only one of them was parsed.
        phoneNumber: pipeline.lead.business.normalizedPhone ?? pipeline.lead.business.phone ?? "",
        leadId: pipeline.leadId,
        body: fillMessageTemplate(pipeline.campaign.messageTemplate ?? pitch.content, pipeline.lead.business.name, project.publishedUrl),
      },
      { media: { kind: "VIDEO", storageKey: recording.storageKey, mimeType: recording.mimeType ?? "video/mp4" } },
    );
    await setStage(db, pipeline, "DELIVERY_QUEUED", { whatsappMessageId: message.id });
  } catch (error) {
    await failPipeline(db, pipeline, "DELIVERY_QUEUED", error);
  }
}

/**
 * Force-fails a pipeline that has sat in an active stage with no progress
 * for far longer than that stage can legitimately take — the recovery path
 * for a process that died mid-flight (see pipeline-maintenance.job.ts).
 * Goes through the same failPipeline path as any other failure, so a
 * pipeline abandoned this way refunds its reserved credit exactly like one
 * that failed normally: a crash must not cost the customer a pitch.
 */
export async function abandonStalePipeline(db: PrismaClient, pipelineId: string, stage: PipelineStage, reason: string): Promise<void> {
  const pipeline = await db.leadPipeline.findUnique({ where: { id: pipelineId }, select: { id: true, campaignId: true, leadId: true } });
  if (!pipeline) return;
  await failPipeline(db, pipeline, stage, new PipelineStepError(reason));
}

async function markLeadPitched(db: PrismaClient, leadId: string, metadata: Record<string, unknown>): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (lead && isLeadTransitionAllowed(lead.status, "PITCHED")) {
    await transitionLeadStatus(db, { leadId, nextStatus: "PITCHED", metadata });
  }
}

// A delivery receipt is the only proof the owner got the message: WhatsApp
// can accept (SENT, with a real message id) a send to a number nobody uses.
// So a pipeline completes on DELIVERED/READ, and a send that never gets a
// receipt fails after this long.
const DELIVERED_STATUSES = new Set(["DELIVERED", "READ"]);
const DEAD_STATUSES = new Set(["FAILED", "BLOCKED", "CANCELLED"]);
export const DELIVERY_RECEIPT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Mirrors WhatsApp message outcomes onto Auto pipelines: SENT once the
 * message is delivered (and the lead becomes PITCHED), or FAILED with the
 * message's reason, or FAILED "not_delivered" when a sent message never
 * receives a delivery receipt. The worker owns the message row; this reads
 * it, so the WhatsApp layer stays unaware of pipelines. Runs on every
 * dashboard poll and from the scheduled job.
 */
export async function syncDeliveries(db: PrismaClient, filter: { campaignId?: string; now?: Date } = {}): Promise<number> {
  const now = filter.now ?? new Date();
  const pending = await db.leadPipeline.findMany({
    where: { stage: "DELIVERY_QUEUED", whatsappMessageId: { not: null }, ...(filter.campaignId ? { campaignId: filter.campaignId } : {}) },
    include: { campaign: { select: { userId: true } } },
    take: 500,
  });
  if (pending.length === 0) return 0;

  const messages = await db.whatsAppMessage.findMany({
    where: { id: { in: pending.map((p) => p.whatsappMessageId!) } },
    select: { id: true, status: true, failureReason: true, sentAt: true },
  });
  const byId = new Map(messages.map((m) => [m.id, m]));

  let changed = 0;
  for (const pipeline of pending) {
    const message = byId.get(pipeline.whatsappMessageId!);
    if (!message) continue;
    if (DELIVERED_STATUSES.has(message.status)) {
      const claimed = await db.$transaction(async (tx) => {
        const result = await tx.leadPipeline.updateMany({
          where: { id: pipeline.id, stage: "DELIVERY_QUEUED", creditOutcome: null },
          data: { stage: "SENT" },
        });
        if (result.count === 1) await resolvePipelineCredit(tx, pipeline, pipeline.campaign.userId, "CONSUMED");
        return result;
      });
      if (claimed.count === 1) {
        changed += 1;
        await markLeadPitched(db, pipeline.leadId, { source: "whatsapp_auto", messageId: message.id });
        emitEvent("pipeline.sent", { pipelineId: pipeline.id, campaignId: pipeline.campaignId, leadId: pipeline.leadId, mode: "AUTO" });
      }
    } else if (DEAD_STATUSES.has(message.status)) {
      changed += 1;
      await failPipeline(db, pipeline, "DELIVERY_QUEUED", new PipelineStepError(message.failureReason ?? message.status.toLowerCase()));
    } else if (message.status === "SENT" && message.sentAt && now.getTime() - message.sentAt.getTime() > DELIVERY_RECEIPT_TIMEOUT_MS) {
      changed += 1;
      await failPipeline(db, pipeline, "DELIVERY_QUEUED", new PipelineStepError("not_delivered"));
    }
  }
  return changed;
}

/** Direct plan: the user confirms they sent the wa.me message. */
export async function markDirectSent(db: PrismaClient, userId: string, pipelineId: string): Promise<LeadPipeline> {
  const pipeline = await loadOwnedPipeline(db, userId, pipelineId);
  if (pipeline.stage !== "LINK_READY") {
    throw new ConflictError(`Only a pipeline with a ready link can be marked as sent (current stage: ${pipeline.stage})`);
  }
  const sentAt = new Date();
  // Conditional on stage+creditOutcome, not a plain update: this is the
  // fix for a real existing gap — nothing previously stopped a second
  // concurrent markDirectSent call (or a stray retryPipeline racing it)
  // from processing the same pipeline twice. Whichever call wins this
  // claim is the only one that consumes the credit or touches Outreach.
  const claimed = await db.$transaction(async (tx) => {
    const result = await tx.leadPipeline.updateMany({ where: { id: pipeline.id, stage: "LINK_READY", creditOutcome: null }, data: { stage: "SENT" } });
    if (result.count === 1) await resolvePipelineCredit(tx, pipeline, pipeline.campaign.userId, "CONSUMED");
    return result;
  });
  if (claimed.count !== 1) {
    throw new ConflictError(`Only a pipeline with a ready link can be marked as sent (current stage: ${pipeline.stage})`);
  }
  await db.outreach.updateMany({
    where: { leadId: pipeline.leadId, status: "LINK_GENERATED", whatsappUrl: pipeline.whatsappUrl ?? undefined },
    data: { status: "SENT", sentAt },
  });
  await markLeadPitched(db, pipeline.leadId, { source: "whatsapp_direct" });
  emitEvent("pipeline.sent", { pipelineId: pipeline.id, campaignId: pipeline.campaignId, leadId: pipeline.leadId, mode: "DIRECT" });
  return db.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
}

// ---------------------------------------------------------------------------
// Retry / pause
// ---------------------------------------------------------------------------

export async function retryPipeline(db: PrismaClient, userId: string, pipelineId: string, deps: PipelineDeps = defaultDeps): Promise<LeadPipeline> {
  const pipeline = await loadOwnedPipeline(db, userId, pipelineId);
  if (pipeline.stage !== "FAILED") {
    throw new ConflictError(`Only a failed pipeline can be retried (current stage: ${pipeline.stage})`);
  }

  switch (pipeline.failureStage) {
    case "SELECTED":
    case "BUILDING_SITE":
    case null:
      if (pipeline.websiteProjectId) await requestRecording(db, pipeline.id, deps);
      else await runFromBuild(db, pipeline.id, deps);
      break;
    case "SITE_PUBLISHED":
    case "RECORDING":
      await requestRecording(db, pipeline.id, deps);
      break;
    case "VIDEO_UPLOADED":
    case "DELIVERY_QUEUED": {
      const recording = pipeline.recordingId ? await db.demoRecording.findUnique({ where: { id: pipeline.recordingId } }) : null;
      if (recording?.status === "READY") await prepareDelivery(db, pipeline.id);
      else await requestRecording(db, pipeline.id, deps);
      break;
    }
    default:
      throw new ValidationError(`Cannot retry from stage ${pipeline.failureStage}`);
  }
  return db.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
}

/**
 * Stops this campaign's queued WhatsApp sends. Messages already being sent
 * are left alone (the worker has claimed them). Affected pipelines become
 * FAILED with reason "paused" and can be retried later.
 */
export async function pauseCampaignSending(db: PrismaClient, userId: string, campaignId: string): Promise<{ cancelled: number }> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { userId: true } });
  if (!campaign || campaign.userId !== userId) throw new NotFoundError("Campaign", campaignId);

  const queued = await db.leadPipeline.findMany({
    where: { campaignId, stage: "DELIVERY_QUEUED", whatsappMessageId: { not: null } },
  });
  let cancelled = 0;
  for (const pipeline of queued) {
    const result = await db.whatsAppMessage.updateMany({
      where: { id: pipeline.whatsappMessageId!, status: "QUEUED" },
      data: { status: "CANCELLED", failureReason: "paused" },
    });
    if (result.count === 1) {
      cancelled += 1;
      await failPipeline(db, pipeline, "DELIVERY_QUEUED", new PipelineStepError("paused"));
    }
  }
  return { cancelled };
}
