import type { PrismaClient } from "@pitchmyweb/db";
import { emitEvent } from "../observability/events";
import {
  AUTO_RETRY_BASE_DELAY_MS,
  AUTO_RETRY_MAX_ATTEMPTS,
  NON_RETRYABLE_REASONS,
  onRecordingFinished,
  retryPipeline,
  syncDeliveries,
} from "../pipeline/pipeline.service";
import { getObjectStorage } from "../storage";

// Scheduled pipeline housekeeping (every few minutes, same scheduler as
// expire-stale-runs):
//
//   1. Mirror WhatsApp send outcomes onto pipelines (SENT -> lead PITCHED)
//      even when nobody has the dashboard open.
//   2. Reconcile recordings: finish pipelines whose recorder callback was
//      lost, and fail recordings stuck for longer than RECORDING_STUCK_MS
//      (worker crash, queue loss) so the lead can be retried.
//   3. Delete recordings of expired previews from storage. The preview page
//      itself already shows "expired" from WebsiteProject.expiresAt.

const EXPIRE_BATCH = 100;
export const RECORDING_STUCK_MS = 30 * 60 * 1000;

export type PipelineMaintenanceResult = {
  deliveriesSynced: number;
  recordingsReconciled: number;
  recordingsTimedOut: number;
  recordingsDeleted: number;
  pipelinesRequeued: number;
  durationMs: number;
};

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

export type { PipelineMaintenanceResult as MaintenanceResult };

export async function runPipelineMaintenanceJob(db: PrismaClient, now = new Date()): Promise<PipelineMaintenanceResult> {
  const started = Date.now();
  const deliveriesSynced = await syncDeliveries(db, { now });
  // Requeue before reconciling so a pipeline that fails in this pass waits out
  // its backoff instead of being retried immediately.
  const pipelinesRequeued = await requeueFailedPipelines(db, now);
  const { reconciled: recordingsReconciled, timedOut: recordingsTimedOut } = await reconcileRecordings(db, now);

  let recordingsDeleted = 0;
  const storage = getObjectStorage();
  if (storage) {
    const expired = await db.demoRecording.findMany({
      where: { storageKey: { not: null }, websiteProject: { expiresAt: { lte: now } } },
      select: { id: true, storageKey: true, posterKey: true },
      take: EXPIRE_BATCH,
    });
    for (const recording of expired) {
      try {
        await storage.delete(recording.storageKey!);
        if (recording.posterKey) await storage.delete(recording.posterKey);
        await db.demoRecording.update({
          where: { id: recording.id },
          data: { storageKey: null, posterKey: null, status: "FAILED", failureReason: "expired" },
        });
        recordingsDeleted += 1;
      } catch (error) {
        console.error(`Could not delete expired recording ${recording.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  const result = { deliveriesSynced, pipelinesRequeued, recordingsReconciled, recordingsTimedOut, recordingsDeleted, durationMs: Date.now() - started };
  emitEvent("preview.cleanup", result);
  return result;
}
