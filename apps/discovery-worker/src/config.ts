import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Read once, validated once. Local development shares apps/api/.env (same
// convention as apps/recorder-worker/apps/whatsapp-worker); a worker-local
// .env (or real environment variables) takes precedence.

const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
const monorepoRoot = path.resolve(workerRoot, "../..");

loadEnv({ path: path.join(workerRoot, ".env"), quiet: true });
loadEnv({ path: path.join(monorepoRoot, "apps/api/.env"), quiet: true });

const intFromEnv = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z.object({
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6381"),

  // Where discovery-results callbacks go, and the bearer token they carry.
  API_INTERNAL_URL: z.string().url().default("http://localhost:4000"),
  INTERNAL_JOBS_SECRET: z.string().min(24, "INTERNAL_JOBS_SECRET must be at least 24 characters"),

  DISCOVERY_CONCURRENCY: intFromEnv(1, 1, 4),
  DISCOVERY_MAX_ATTEMPTS: intFromEnv(2, 1, 5),
  DISCOVERY_REQUEST_TIMEOUT_MS: intFromEnv(30_000, 5_000, 120_000),
  // A search stuck longer than this is failed by the API's stale-run reaper
  // (run.service.ts::expireStaleExecutions) — provider-agnostic, so it also
  // catches a discovery-worker process that died mid-job.
  DISCOVERY_JOB_TIMEOUT_MS: intFromEnv(120_000, 15_000, 600_000),

  // Overpass API endpoint. The public instance is rate-limited/shared —
  // production should point this at a self-hosted or paid mirror instead
  // (see the Phase 2 plan's own note on this).
  OVERPASS_API_URL: z.string().url().default("https://overpass-api.de/api/interpreter"),
  // Nominatim geocoder endpoint. Same public-instance caveat as Overpass;
  // its usage policy additionally requires a real, identifying User-Agent
  // (NOMINATIM_USER_AGENT below), not a generic one.
  NOMINATIM_API_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  NOMINATIM_USER_AGENT: z.string().min(1).default("PitchMyWeb-DiscoveryWorker/1.0 (support@claxonai.in)"),

  // Which BusinessDiscoverySource this worker process runs — keep in sync
  // with apps/api's LEAD_PROVIDER for the same environment (osm <-> osm,
  // serper <-> serper), since apps/api decides *that* a search runs and
  // this worker decides *how*.
  DISCOVERY_SOURCE: z.enum(["osm", "serper"]).default("osm"),
  // Google Maps + Google Search, via serper.dev. Required when
  // DISCOVERY_SOURCE=serper; unused otherwise.
  SERPER_API_KEY: z.string().min(1).optional(),
  // AI enrichment (business summary/services/outreach message) for the
  // serper source, via LangChain + OpenAI. Optional even when
  // DISCOVERY_SOURCE=serper — if unset, businesses are still discovered,
  // just without `insights` (see ai/enrichment.ts's NullEnrichmentClient).
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),

  WORKER_ID: z.string().min(1).default(`${os.hostname()}-${process.pid}`),
  LOG_LEVEL: z.enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.string().default("development"),
});

export type DiscoveryConfig = z.infer<typeof envSchema>;

let cached: DiscoveryConfig | undefined;

export function getConfig(): DiscoveryConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Invalid discovery-worker environment — ${detail}`);
    }
    if (parsed.data.DISCOVERY_SOURCE === "serper" && !parsed.data.SERPER_API_KEY) {
      throw new Error("Invalid discovery-worker environment — SERPER_API_KEY is required when DISCOVERY_SOURCE=serper");
    }
    cached = parsed.data;
  }
  return cached;
}
