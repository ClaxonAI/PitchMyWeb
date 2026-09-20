import type { PrismaClient } from "@pitchmyweb/db";
import { expireStaleExecutions } from "../campaigns/run.service";
import { emitEvent } from "../observability/events";

// Scheduled maintenance: fail async lead-discovery runs whose workflow never
// reported back. Safe to run from several schedulers at once. Each
// execution is claimed with the ingest lease before it is finalized, so no
// run is finalized twice.
//
// Triggered by either:
//   POST /api/internal/jobs/expire-stale-runs   (n8n Schedule, platform cron)
//   npm run job:expire-stale-runs -w apps/api    (Kubernetes CronJob, crontab)

const BATCH_SIZE = 50;
const MAX_BATCHES = 20;

export type ExpireStaleRunsResult = { expired: number; batches: number; durationMs: number };

export async function runExpireStaleRunsJob(
  db: PrismaClient,
  options: { now?: Date; timeoutMinutes?: number } = {},
): Promise<ExpireStaleRunsResult> {
  const started = Date.now();
  let expired = 0;
  let batches = 0;

  // expireStaleExecutions handles up to BATCH_SIZE per call. Keep going
  // while a batch is full, with a hard cap so one invocation stays short.
  while (batches < MAX_BATCHES) {
    batches += 1;
    const count = await expireStaleExecutions(db, options);
    expired += count;
    if (count < BATCH_SIZE) break;
  }

  const result = { expired, batches, durationMs: Date.now() - started };
  emitEvent("lead_discovery.stale_runs_expired", result, { level: expired > 0 ? "warn" : "info" });
  return result;
}
