import { Worker, type Job } from "bullmq";
import { QUEUE_WEBSITE_VERIFICATION, createRedisConnection, queuePrefix, websiteVerificationJobSchema, type WebsiteVerificationJob } from "@pitchmyweb/contracts";
import { getConfig } from "./config.js";
import { getBrowser, closeBrowser } from "./browser.js";
import { verifyWebsite } from "./verify-website.js";
import { processVerification } from "./process-verification.js";
import { disconnectDb, getDb, logger, sanitizeError } from "./runtime.js";

// apps/verification-worker: consumes `website-verification`, checks one
// Business's website liveness (HTTP-first, Playwright escalation on an
// ambiguous parked-page signal), and writes the result directly — see
// process-verification.ts's own header comment on why this worker writes
// straight to Postgres rather than reporting back to apps/api over HTTP.

async function main(): Promise<void> {
  const config = getConfig();
  const db = getDb();
  await getBrowser(); // fail fast if Chromium is not installed

  const connection = createRedisConnection(config.REDIS_URL);

  const worker = new Worker<WebsiteVerificationJob>(
    QUEUE_WEBSITE_VERIFICATION,
    async (job: Job<WebsiteVerificationJob>) => {
      const { businessId } = websiteVerificationJobSchema.parse(job.data);
      const browser = await getBrowser();
      return processVerification(
        {
          db,
          verify: (website) => verifyWebsite(website, { browser, httpTimeoutMs: config.VERIFICATION_HTTP_TIMEOUT_MS, playwrightTimeoutMs: config.VERIFICATION_PLAYWRIGHT_TIMEOUT_MS }),
          log: (level, fields, message) => logger[level](fields, message),
        },
        businessId,
      );
    },
    {
      connection,
      prefix: queuePrefix(),
      concurrency: config.VERIFICATION_CONCURRENCY,
      lockDuration: config.VERIFICATION_JOB_TIMEOUT_MS,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  );

  worker.on("failed", (job, error) => logger.warn({ jobId: job?.id, err: sanitizeError(error) }, "verification job failed"));
  worker.on("error", (error) => logger.error({ err: sanitizeError(error) }, "worker error"));
  logger.info({ queue: QUEUE_WEBSITE_VERIFICATION, concurrency: config.VERIFICATION_CONCURRENCY, prefix: queuePrefix() }, "verification worker started");

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
  logger.fatal({ err: sanitizeError(error) }, "verification worker failed to start");
  process.exit(1);
});
