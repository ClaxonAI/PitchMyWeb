import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Read once, validated once. Like the WhatsApp worker, local development
// shares apps/api/.env; a worker-local .env (or real environment variables)
// takes precedence.

const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
const monorepoRoot = path.resolve(workerRoot, "../..");

loadEnv({ path: path.join(workerRoot, ".env"), quiet: true });
loadEnv({ path: path.join(monorepoRoot, "apps/api/.env"), quiet: true });

const intFromEnv = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6381"),

  // Only pages under this origin are ever opened (SSRF guard).
  SITES_PUBLIC_URL: z.string().url("SITES_PUBLIC_URL must be a URL"),
  // Where recording-ready callbacks go, and the bearer token they carry.
  API_INTERNAL_URL: z.string().url().default("http://localhost:4000"),
  INTERNAL_JOBS_SECRET: z.string().min(24, "INTERNAL_JOBS_SECRET must be at least 24 characters"),

  RECORDER_CONCURRENCY: intFromEnv(2, 1, 8),
  RECORDER_MAX_ATTEMPTS: intFromEnv(2, 1, 5),
  RECORDER_NAVIGATION_TIMEOUT_MS: intFromEnv(45_000, 5_000, 180_000),
  RECORDER_TOUR_SECONDS: intFromEnv(22, 8, 60),
  // A recording stuck longer than this is failed by the API maintenance job.
  // Two recordings per job (phone and laptop), each ~25s of tour plus load
  // and encode time.
  RECORDER_JOB_TIMEOUT_MS: intFromEnv(420_000, 30_000, 900_000),

  WORKER_ID: z.string().min(1).default(`${os.hostname()}-${process.pid}`),
  LOG_LEVEL: z.enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.string().default("development"),
});

export type RecorderConfig = z.infer<typeof envSchema>;

let cached: RecorderConfig | undefined;

export function getConfig(): RecorderConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Invalid recorder environment — ${detail}`);
    }
    cached = parsed.data;
  }
  return cached;
}
