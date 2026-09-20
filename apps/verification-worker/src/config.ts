import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Read once, validated once. Local development shares apps/api/.env (same
// convention as every other worker in this monorepo); a worker-local .env
// (or real environment variables) takes precedence.

const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
const monorepoRoot = path.resolve(workerRoot, "../..");

loadEnv({ path: path.join(workerRoot, ".env"), quiet: true });
loadEnv({ path: path.join(monorepoRoot, "apps/api/.env"), quiet: true });

const intFromEnv = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6381"),

  VERIFICATION_CONCURRENCY: intFromEnv(2, 1, 8),
  VERIFICATION_MAX_ATTEMPTS: intFromEnv(2, 1, 5),
  // Per-hop timeout for the fast HTTP-first check.
  VERIFICATION_HTTP_TIMEOUT_MS: intFromEnv(8_000, 2_000, 30_000),
  // Navigation timeout for the Playwright escalation (only reached on an
  // ambiguous 2xx-but-maybe-parked response).
  VERIFICATION_PLAYWRIGHT_TIMEOUT_MS: intFromEnv(10_000, 3_000, 60_000),
  // A verification stuck longer than this is a job-infrastructure problem,
  // not a slow website (the HTTP/Playwright timeouts above already bound
  // per-attempt latency) — same role as RECORDER_JOB_TIMEOUT_MS.
  VERIFICATION_JOB_TIMEOUT_MS: intFromEnv(60_000, 15_000, 300_000),

  WORKER_ID: z.string().min(1).default(`${os.hostname()}-${process.pid}`),
  LOG_LEVEL: z.enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.string().default("development"),
});

export type VerificationConfig = z.infer<typeof envSchema>;

let cached: VerificationConfig | undefined;

export function getConfig(): VerificationConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Invalid verification-worker environment — ${detail}`);
    }
    cached = parsed.data;
  }
  return cached;
}
