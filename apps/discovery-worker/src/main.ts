import { Worker, type Job } from "bullmq";
import { QUEUE_DISCOVERY, createRedisConnection, discoveryEventsChannel, queuePrefix, discoveryJobSchema, type DiscoveryEvent, type DiscoveryJob } from "@pitchmyweb/contracts";
import { getConfig, type DiscoveryConfig } from "./config.js";
import { jobParamsFetcher, processDiscovery, resultsReporter } from "./process-discovery.js";
import { NominatimClient } from "./sources/nominatim.js";
import { OverpassSource } from "./sources/overpass.js";
import { SerperSource } from "./sources/serper.js";
import type { BusinessDiscoverySource } from "./sources/index.js";
import { NullEnrichmentClient, OpenAiEnrichmentClient } from "./ai/enrichment.js";
import { logger, sanitizeError } from "./runtime.js";

function buildSource(config: DiscoveryConfig): BusinessDiscoverySource {
  if (config.DISCOVERY_SOURCE === "serper") {
    if (!config.SERPER_API_KEY) throw new Error("SERPER_API_KEY is required when DISCOVERY_SOURCE=serper");
    const enrichment = config.OPENAI_API_KEY
      ? new OpenAiEnrichmentClient({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL })
      : new NullEnrichmentClient();
    if (!config.OPENAI_API_KEY) {
      logger.warn({}, "OPENAI_API_KEY not set — serper source will discover businesses without AI insights (summary/services/outreach)");
    }
    return new SerperSource({ apiKey: config.SERPER_API_KEY, enrichment, enrichmentModelName: config.OPENAI_API_KEY ? config.OPENAI_MODEL : null, timeoutMs: config.DISCOVERY_REQUEST_TIMEOUT_MS });
  }

  const nominatim = new NominatimClient({ apiUrl: config.NOMINATIM_API_URL, userAgent: config.NOMINATIM_USER_AGENT, timeoutMs: config.DISCOVERY_REQUEST_TIMEOUT_MS });
  return new OverpassSource({ apiUrl: config.OVERPASS_API_URL, userAgent: config.NOMINATIM_USER_AGENT, timeoutMs: config.DISCOVERY_REQUEST_TIMEOUT_MS, nominatim });
}

// apps/discovery-worker: consumes `business-discovery`, searches OSM/
// Overpass for one campaign execution's businesses, and reports results
// back to apps/api (which owns all Business/Lead-affecting state — see
// process-discovery.ts's own header comment on why this worker has no
// database connection at all).

async function main(): Promise<void> {
  const config = getConfig();

  const source = buildSource(config);
  const fetchJobParams = jobParamsFetcher(config.API_INTERNAL_URL, config.INTERNAL_JOBS_SECRET);
  const { reportResults, reportFailure } = resultsReporter(config.API_INTERNAL_URL, config.INTERNAL_JOBS_SECRET);

  const connection = createRedisConnection(config.REDIS_URL);
  const eventsRedis = createRedisConnection(config.REDIS_URL);

  const publish = async (event: DiscoveryEvent): Promise<void> => {
    await eventsRedis.publish(discoveryEventsChannel(event.executionId), JSON.stringify(event));
  };

  const worker = new Worker<DiscoveryJob>(
    QUEUE_DISCOVERY,
    async (job: Job<DiscoveryJob>) => {
      const { executionId } = discoveryJobSchema.parse(job.data);
      const attempts = job.opts.attempts ?? config.DISCOVERY_MAX_ATTEMPTS;
      return processDiscovery(
        {
          source,
          fetchJobParams,
          reportResults,
          reportFailure,
          publish,
          log: (level, fields, message) => logger[level](fields, message),
        },
        executionId,
        { number: job.attemptsMade + 1, max: attempts },
      );
    },
    {
      connection,
      prefix: queuePrefix(),
      concurrency: config.DISCOVERY_CONCURRENCY,
      lockDuration: config.DISCOVERY_JOB_TIMEOUT_MS,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  );

  worker.on("failed", (job, error) => logger.warn({ jobId: job?.id, err: sanitizeError(error) }, "discovery job failed"));
  worker.on("error", (error) => logger.error({ err: sanitizeError(error) }, "worker error"));
  logger.info({ queue: QUEUE_DISCOVERY, source: config.DISCOVERY_SOURCE, concurrency: config.DISCOVERY_CONCURRENCY, prefix: queuePrefix() }, "discovery worker started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    try {
      await worker.close();
      await connection.quit();
      await eventsRedis.quit();
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
  logger.fatal({ err: sanitizeError(error) }, "discovery worker failed to start");
  process.exit(1);
});
