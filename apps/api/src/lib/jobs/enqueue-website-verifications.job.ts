import type { PrismaClient } from "@pitchmyweb/db";
import { emitEvent } from "../observability/events";

// Scheduled maintenance: enqueue a rolling batch of Business rows whose
// website needs a (re-)verification check (Phase 2C). Never-checked rows go
// first; a business already checked recently is skipped until it goes
// stale. Safe to run from several schedulers at once — enqueueing uses a
// deterministic jobId (see lib/pipeline/website-verification-queue.ts), so a
// business already queued is a no-op, not a duplicate.
//
// Triggered by either:
//   POST /api/internal/jobs/enqueue-website-verifications  (platform cron)
//   npm run job:enqueue-website-verifications -w apps/api  (Kubernetes CronJob, crontab)

const BATCH_SIZE = 200;
const REVERIFY_AFTER_DAYS = 7;

export type EnqueueWebsiteVerificationsResult = { enqueued: number; durationMs: number };

export async function runEnqueueWebsiteVerificationsJob(
  db: PrismaClient,
  enqueue: (businessId: string) => Promise<void>,
): Promise<EnqueueWebsiteVerificationsResult> {
  const started = Date.now();
  const staleBefore = new Date(Date.now() - REVERIFY_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db.business.findMany({
    where: {
      AND: [{ website: { not: null } }, { website: { not: "" } }],
      mergedIntoId: null,
      OR: [{ websiteVerifiedAt: null }, { websiteVerifiedAt: { lt: staleBefore } }],
    },
    select: { id: true },
    orderBy: [{ websiteVerifiedAt: { sort: "asc", nulls: "first" } }],
    take: BATCH_SIZE,
  });

  for (const business of candidates) {
    await enqueue(business.id);
  }

  const result = { enqueued: candidates.length, durationMs: Date.now() - started };
  emitEvent("website_verification.batch_enqueued", result);
  return result;
}
