import type { PrismaClient } from "@pitchmyweb/db";
import { emitEvent } from "../observability/events";
import {
  abandonStalePipeline,
  AUTO_RETRY_BASE_DELAY_MS,
  AUTO_RETRY_MAX_ATTEMPTS,
  buildAndPublish,
  NON_RETRYABLE_REASONS,
  onRecordingFinished,
  requestRecording,
  retryPipeline,
  syncDeliveries,
} from "../pipeline/pipeline.service";
import { recoverStaleBatches } from "../campaigns/selection.service";
import { getObjectStorage } from "../storage";
import { sweepWhatsAppSessions } from "../whatsapp/session-policy";

// Scheduled pipeline housekeeping (every few minutes, same scheduler as
// expire-stale-runs):
//
//   1. Mirror WhatsApp send outcomes onto pipelines (SENT -> lead PITCHED)
//      even when nobody has the dashboard open.
//   2. Reconcile recordings: finish pipelines whose recorder callback was
//      lost, and fail recordings stuck for longer than RECORDING_STUCK_MS
//      (worker crash, queue loss) so the lead can be retried.
//   3. Delete demo videos from storage once their download window
//      (DemoRecording.expiresAt, VIDEO_RETENTION_DAYS after recording) has
//      passed, or their preview has expired. Storage only ever holds about a
//      week of videos this way.
//   4. Sign out WhatsApp numbers whose campaign has finished, or whose
//      3-day "stay signed in" window has run out (whatsapp/session-policy.ts).

const EXPIRE_BATCH = 100;
export const RECORDING_STUCK_MS = 30 * 60 * 1000;

export type PipelineMaintenanceResult = {
  deliveriesSynced: number;
  recordingsReconciled: number;
  recordingsTimedOut: number;
  recordingsDeleted: number;
  whatsappSignedOut: number;
  pipelinesRequeued: number;
  pipelinesResumed: number;
  pipelinesAbandoned: number;
  batchesRecovered: number;
  durationMs: number;
};

/**
 * A pipeline that was selected (and had a credit reserved for it) but never
 * advanced past SELECTED — the process that created it died before
 * startPipelines could build its site. Resume it if it still has attempts
 * left, otherwise abandon it, which refunds the reserved credit through
 * the normal failure path. Either way the credit stops being stranded.
 */
export const STALE_SELECTED_MS = 10 * 60 * 1000;

async function recoverStalePipelines(db: PrismaClient, now: Date): Promise<{ resumed: number; abandoned: number }> {
  const stale = await db.leadPipeline.findMany({
    where: {
      stage: "SELECTED",
      batchId: { not: null },
      creditOutcome: null,
      updatedAt: { lte: new Date(now.getTime() - STALE_SELECTED_MS) },
      campaign: { status: { in: ["PROCESSING", "COMPLETED"] } },
    },
    orderBy: { updatedAt: "asc" },
    take: AUTO_RETRY_BATCH,
  });

  let resumed = 0;
  let abandoned = 0;
  for (const pipeline of stale) {
    try {
      // Same optimistic claim the requeue path uses: if another worker (or
      // a request that was merely slow, not dead) moved this row first, its
      // updatedAt no longer matches and we leave it alone.
      const claimed = await db.leadPipeline.updateMany({
        where: { id: pipeline.id, stage: "SELECTED", updatedAt: pipeline.updatedAt },
        data: { attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;

      if (pipeline.attempts + 1 >= AUTO_RETRY_MAX_ATTEMPTS) {
        await abandonStalePipeline(db, pipeline.id, "SELECTED", "stuck_selected");
        abandoned += 1;
        continue;
      }
      const published = await buildAndPublish(db, pipeline.id);
      if (published) await requestRecording(db, pipeline.id);
      resumed += 1;
    } catch (error) {
      console.error(`Could not recover stale pipeline ${pipeline.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return { resumed, abandoned };
}

async function reconcileRecordings(db: PrismaClient, now: Date): Promise<{ reconciled: number; timedOut: number }> {
  const waiting = await db.leadPipeline.findMany({
    where: { stage: "RECORDING", recordingId: { not: null } },
    select: { recordingId: true },
    take: 200,
  });
  if (waiting.length === 0) return { reconciled: 0, timedOut: 0 };

  const recordings = await db.demoRecording.findMany({
    where: { id: { in: waiting.map((p) => p.recordingId!) } },
    select: { id: true, status: true, updatedAt: true },
  });

  let reconciled = 0;
  let timedOut = 0;
  for (const recording of recordings) {
    if (recording.status === "QUEUED" || recording.status === "RECORDING") {
      if (now.getTime() - recording.updatedAt.getTime() < RECORDING_STUCK_MS) continue;
      await db.demoRecording.update({ where: { id: recording.id }, data: { status: "FAILED", failureReason: "recording_timeout" } });
      timedOut += 1;
    }
    const result = await onRecordingFinished(db, recording.id).catch((error: unknown) => {
      console.error(`Could not reconcile recording ${recording.id}:`, error instanceof Error ? error.message : error);
      return null;
    });
    if (result?.stage && result.stage !== "RECORDING") reconciled += 1;
  }
  return { reconciled, timedOut };
}

// AUTO_RETRY_MAX_ATTEMPTS / AUTO_RETRY_BASE_DELAY_MS / NON_RETRYABLE_REASONS
// now live in pipeline.service.ts (imported above) rather than here:
// failPipeline needs them at the moment a pipeline fails, to decide whether
// its reserved credit is refunded immediately or stays reserved for a
// retry — this job's own use of them, on a schedule, is the same policy
// read from the same place, not a second copy of it.
const AUTO_RETRY_BATCH = 50;

async function requeueFailedPipelines(db: PrismaClient, now: Date): Promise<number> {
  const failed = await db.leadPipeline.findMany({
    where: {
      stage: "FAILED",
      attempts: { lt: AUTO_RETRY_MAX_ATTEMPTS },
      OR: [{ failureReason: null }, { failureReason: { notIn: NON_RETRYABLE_REASONS } }],
      campaign: { status: { in: ["PROCESSING", "COMPLETED"] } },
      updatedAt: { lte: new Date(now.getTime() - AUTO_RETRY_BASE_DELAY_MS) },
    },
    include: { campaign: { select: { userId: true } } },
    orderBy: { updatedAt: "asc" },
    take: AUTO_RETRY_BATCH,
  });

  let requeued = 0;
  for (const pipeline of failed) {
    // Back off: wait base * 2^(attempts-1) since the last failure.
    const wait = AUTO_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, pipeline.attempts - 1);
    if (now.getTime() - pipeline.updatedAt.getTime() < wait) continue;
    try {
      // Later-stage retries do not bump attempts themselves, so count here to
      // guarantee the cap holds whichever stage failed.
      const claimed = await db.leadPipeline.updateMany({
        where: { id: pipeline.id, stage: "FAILED", updatedAt: pipeline.updatedAt },
        data: { attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      await retryPipeline(db, pipeline.campaign.userId, pipeline.id);
      requeued += 1;
    } catch (error) {
      console.error(`Could not requeue pipeline ${pipeline.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return requeued;
}

/**
 * Deletes demo videos whose download window has closed (or whose preview
 * expired first) from object storage, then clears the row's keys so nothing
 * can sign a URL for an object that no longer exists. Loops in batches until
 * nothing is left or the pass has done MAX_EXPIRE_BATCHES of them, so a
 * backlog (the first run after this shipped, a long scheduler outage) drains
 * in one or two passes rather than 100 videos every five minutes.
 */
const MAX_EXPIRE_BATCHES = 20;

export async function deleteExpiredRecordings(db: PrismaClient, now = new Date()): Promise<number> {
  const storage = getObjectStorage();
  if (!storage) return 0;

  let deleted = 0;
  const failed = new Set<string>();
  for (let batch = 0; batch < MAX_EXPIRE_BATCHES; batch += 1) {
    const expired = await db.demoRecording.findMany({
      where: {
        storageKey: { not: null },
        id: { notIn: [...failed] },
        OR: [{ expiresAt: { lte: now } }, { websiteProject: { expiresAt: { lte: now } } }],
      },
      select: { id: true, storageKey: true, posterKey: true },
      orderBy: { expiresAt: "asc" },
      take: EXPIRE_BATCH,
    });
    if (expired.length === 0) break;

    for (const recording of expired) {
      try {
        await storage.delete(recording.storageKey!);
        if (recording.posterKey) await storage.delete(recording.posterKey);
        await db.demoRecording.update({
          where: { id: recording.id },
          data: { storageKey: null, posterKey: null, status: "FAILED", failureReason: "expired" },
        });
        deleted += 1;
      } catch (error) {
        // Skipped for the rest of this pass so one object the store keeps
        // refusing cannot spin the loop; the next pass tries it again.
        failed.add(recording.id);
        console.error(`Could not delete expired recording ${recording.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }
  return deleted;
}

export type { PipelineMaintenanceResult as MaintenanceResult };

export async function runPipelineMaintenanceJob(db: PrismaClient, now = new Date()): Promise<PipelineMaintenanceResult> {
  const started = Date.now();
  const deliveriesSynced = await syncDeliveries(db, { now });
  // Requeue before reconciling so a pipeline that fails in this pass waits out
  // its backoff instead of being retried immediately.
  const pipelinesRequeued = await requeueFailedPipelines(db, now);
  const { reconciled: recordingsReconciled, timedOut: recordingsTimedOut } = await reconcileRecordings(db, now);
  // Credit recovery: a reservation must never stay reserved forever because
  // a process died. Pipelines first (they may still be resumable), then the
  // batches whose reservation never got as far as creating one.
  const { resumed: pipelinesResumed, abandoned: pipelinesAbandoned } = await recoverStalePipelines(db, now);
  const batchesRecovered = await recoverStaleBatches(db, now);

  const recordingsDeleted = await deleteExpiredRecordings(db, now);
  // Last, so it sees every pipeline and batch outcome this pass produced.
  const { signedOut: whatsappSignedOut } = await sweepWhatsAppSessions(db, now);

  const result = {
    deliveriesSynced,
    pipelinesRequeued,
    pipelinesResumed,
    pipelinesAbandoned,
    batchesRecovered,
    recordingsReconciled,
    recordingsTimedOut,
    recordingsDeleted,
    whatsappSignedOut,
    durationMs: Date.now() - started,
  };
  emitEvent("preview.cleanup", result);
  return result;
}
