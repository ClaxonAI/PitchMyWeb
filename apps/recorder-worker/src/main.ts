import { Worker, type Job } from "bullmq";
import { QUEUE_RECORDING, createRedisConnection, queuePrefix, recordingJobSchema, type RecordingJob } from "@pitchmyweb/contracts";
import { ObjectStorage } from "@pitchmyweb/storage";
import { getConfig } from "./config.js";
import { apiNotifier, processRecording } from "./process-recording.js";
import { closeBrowser, getBrowser } from "./record.js";
import { disconnectDb, getDb, logger, sanitizeError } from "./runtime.js";

// apps/recorder-worker: consumes `website-recording`, records each preview
// with Playwright, uploads a WhatsApp-ready MP4 and tells the API.

async function main(): Promise<void> {
  const config = getConfig();
  const db = getDb();
  const storage = ObjectStorage.fromEnv();
  await storage.ensureBucket();
  await getBrowser(); // fail fast if Chromium is not installed

  const notify = apiNotifier(config.API_INTERNAL_URL, config.INTERNAL_JOBS_SECRET);
  const connection = createRedisConnection(config.REDIS_URL);

  const worker = new Worker<RecordingJob>(
    QUEUE_RECORDING,
    async (job: Job<RecordingJob>) => {
      const { recordingId } = recordingJobSchema.parse(job.data);
      const attempts = job.opts.attempts ?? config.RECORDER_MAX_ATTEMPTS;
      return processRecording(
        {
          db,
          storage,
          sitesPublicUrl: config.SITES_PUBLIC_URL,
          tourSeconds: config.RECORDER_TOUR_SECONDS,
          navigationTimeoutMs: config.RECORDER_NAVIGATION_TIMEOUT_MS,
          notify: (id) => notify(id).catch((error) => logger.warn({ recordingId: id, err: sanitizeError(error) }, "recording callback failed")),
          log: (level, fields, message) => logger[level](fields, message),
        },
        recordingId,
        { number: job.attemptsMade + 1, max: attempts },
      );
    },
    {
      connection,
      prefix: queuePrefix(),
      concurrency: config.RECORDER_CONCURRENCY,
      lockDuration: config.RECORDER_JOB_TIMEOUT_MS,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  );

  worker.on("failed", (job, error) => logger.warn({ jobId: job?.id, err: sanitizeError(error) }, "recording job failed"));
  worker.on("error", (error) => logger.error({ err: sanitizeError(error) }, "worker error"));
  logger.info({ queue: QUEUE_RECORDING, concurrency: config.RECORDER_CONCURRENCY, prefix: queuePrefix() }, "recorder worker started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    try {
      await worker.close();
      await closeBrowser();
      await connection.quit();
      await disconnectDb();
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, "error during shutdown");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => logger.error({ err: sanitizeError(reason) }, "unhandled rejection"));
}

main().catch((error) => {
  logger.fatal({ err: sanitizeError(error) }, "recorder worker failed to start");
  process.exit(1);
});
