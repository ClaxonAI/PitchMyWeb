import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_RECORDING, createRedisConnection, queuePrefix, recordingJobSchema, type RecordingJob } from "@pitchmyweb/contracts";

// Producer for apps/recorder-worker. Same conventions as
// lib/whatsapp/queue.ts: a lazy, process-wide connection, the shared
// queuePrefix() (so test runs never reach a live recorder), and a
// deterministic job id so a duplicate request cannot record twice.

const globalForRecording = globalThis as unknown as {
  recordingRedis?: Redis;
  recordingQueue?: Queue<RecordingJob>;
};

export function recordingQueue(): Queue<RecordingJob> {
  globalForRecording.recordingRedis ??= createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
  globalForRecording.recordingQueue ??= new Queue<RecordingJob>(QUEUE_RECORDING, {
    connection: globalForRecording.recordingRedis,
    prefix: queuePrefix(),
  });
  return globalForRecording.recordingQueue;
}

export async function enqueueRecording(job: RecordingJob, attempts = Number(process.env.RECORDER_MAX_ATTEMPTS ?? 2)): Promise<void> {
  const payload = recordingJobSchema.parse(job);
  await recordingQueue().add("record", payload, {
    jobId: `record-${payload.recordingId}`,
    attempts: Number.isInteger(attempts) && attempts > 0 ? attempts : 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: true,
    removeOnFail: 200,
  });
}
