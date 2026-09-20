import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_DISCOVERY, createRedisConnection, queuePrefix, discoveryJobSchema, type DiscoveryJob } from "@pitchmyweb/contracts";

// Producer for apps/discovery-worker. Same conventions as
// lib/pipeline/recording-queue.ts: a lazy, process-wide connection, the
// shared queuePrefix() (so test runs never reach a live worker), and a
// deterministic job id so a duplicate trigger cannot dispatch two searches
// for the same execution.

const globalForDiscovery = globalThis as unknown as {
  discoveryRedis?: Redis;
  discoveryQueue?: Queue<DiscoveryJob>;
};

export function discoveryQueue(): Queue<DiscoveryJob> {
  globalForDiscovery.discoveryRedis ??= createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
  globalForDiscovery.discoveryQueue ??= new Queue<DiscoveryJob>(QUEUE_DISCOVERY, {
    connection: globalForDiscovery.discoveryRedis,
    prefix: queuePrefix(),
  });
  return globalForDiscovery.discoveryQueue;
}

export async function enqueueDiscovery(job: DiscoveryJob, attempts = Number(process.env.DISCOVERY_MAX_ATTEMPTS ?? 2)): Promise<void> {
  const payload = discoveryJobSchema.parse(job);
  await discoveryQueue().add("discover", payload, {
    jobId: `discover-${payload.executionId}`,
    attempts: Number.isInteger(attempts) && attempts > 0 ? attempts : 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: true,
    removeOnFail: 200,
  });
}
