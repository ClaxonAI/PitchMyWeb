import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_WEBSITE_VERIFICATION, createRedisConnection, queuePrefix, websiteVerificationJobSchema, type WebsiteVerificationJob } from "@pitchmyweb/contracts";

// Producer for apps/verification-worker. Same conventions as
// lib/pipeline/discovery-queue.ts: a lazy, process-wide connection, the
// shared queuePrefix(), and a deterministic job id so enqueueing the same
// business twice before it's processed is a safe no-op rather than a
// duplicate check.

const globalForVerification = globalThis as unknown as {
  verificationRedis?: Redis;
  verificationQueue?: Queue<WebsiteVerificationJob>;
};

export function websiteVerificationQueue(): Queue<WebsiteVerificationJob> {
  globalForVerification.verificationRedis ??= createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
  globalForVerification.verificationQueue ??= new Queue<WebsiteVerificationJob>(QUEUE_WEBSITE_VERIFICATION, {
    connection: globalForVerification.verificationRedis,
    prefix: queuePrefix(),
  });
  return globalForVerification.verificationQueue;
}

/**
 * Releases the process-wide connection above. Only the one-shot CLI needs
 * this: inside the API the queue is meant to outlive any single request, but
 * a cron invocation that leaves an open ioredis socket behind never exits —
 * which is exactly how scripts/enqueue-website-verifications.ts hung, one
 * stuck process per scheduled run.
 */
export async function closeWebsiteVerificationQueue(): Promise<void> {
  await globalForVerification.verificationQueue?.close();
  await globalForVerification.verificationRedis?.quit();
  globalForVerification.verificationQueue = undefined;
  globalForVerification.verificationRedis = undefined;
}

export async function enqueueWebsiteVerification(job: WebsiteVerificationJob): Promise<void> {
  const payload = websiteVerificationJobSchema.parse(job);
  await websiteVerificationQueue().add("verify", payload, {
    jobId: `verify-${payload.businessId}`,
    attempts: 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: true,
    removeOnFail: 200,
  });
}
