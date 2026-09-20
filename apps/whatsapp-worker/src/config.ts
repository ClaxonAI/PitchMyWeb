import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Environment is read once, validated once, and never touched through
// process.env again. A missing WA_AUTH_ENCRYPTION_KEY or DATABASE_URL is a
// boot failure, not a surprise at the moment the first session tries to
// persist credentials.

const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
const monorepoRoot = path.resolve(workerRoot, "../..");

// Local development keeps one env file (apps/api/.env) so DATABASE_URL is
// defined in exactly one place; a worker-local .env overrides it when the
// worker runs somewhere else. Neither file is required: a real environment
// (docker, CI) supplies the variables directly and both loads are no-ops.
loadEnv({ path: path.join(workerRoot, ".env") });
loadEnv({ path: path.join(monorepoRoot, "apps/api/.env") });

const intFromEnv = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6381"),

  // 32 bytes, hex-encoded: the AES-256-GCM key protecting every stored
  // Baileys credential. Generate with
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  WA_AUTH_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "WA_AUTH_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),
  // Stamped onto every row this process writes, so a future key rotation
  // can tell which rows still need re-encrypting.
  WA_AUTH_KEY_VERSION: intFromEnv(1, 1, 1_000_000),

  // Identifies this process in logs and in the session lock value, which is
  // what makes "some other worker owns this session" a legible condition
  // rather than a mystery.
  WORKER_ID: z.string().min(1).default(`${os.hostname()}-${process.pid}`),

  // --- Outreach limits (deliberately conservative; see the ADR) ---------
  WA_MAX_PER_HOUR: intFromEnv(20, 1, 10_000),
  WA_MAX_PER_DAY: intFromEnv(80, 1, 100_000),
  WA_MIN_GAP_SECONDS: intFromEnv(45, 0, 3_600),
  WA_DUPLICATE_WINDOW_HOURS: intFromEnv(24, 0, 24 * 365),

  // --- Session/reconnect tuning ----------------------------------------
  WA_MAX_RECONNECT_ATTEMPTS: intFromEnv(8, 1, 100),
  WA_RECONNECT_BASE_DELAY_MS: intFromEnv(2_000, 100, 600_000),
  WA_RECONNECT_MAX_DELAY_MS: intFromEnv(300_000, 1_000, 3_600_000),
  // The lock must outlive a renew interval by a comfortable margin: a
  // single slow Redis round-trip should not hand the session to another
  // worker while this one still holds a live socket.
  WA_LOCK_TTL_MS: intFromEnv(30_000, 5_000, 600_000),
  WA_LOCK_RENEW_MS: intFromEnv(10_000, 1_000, 300_000),

  // A hung provider call must not pin a message at SENDING forever. With
  // WA_SEND_CONCURRENCY at 1 it would also block every other send in this
  // process, so the cap is generous enough for a legitimately slow send
  // (Baileys can burn two 60s internal query timeouts resolving a number it
  // has no session with) but finite.
  WA_SEND_TIMEOUT_MS: intFromEnv(180_000, 5_000, 600_000),
  WA_CHECK_NUMBER_TIMEOUT_MS: intFromEnv(30_000, 1_000, 300_000),
  // A video send downloads the file from storage and uploads it to
  // WhatsApp's media servers, so it gets its own, larger budget.
  WA_SEND_MEDIA_TIMEOUT_MS: intFromEnv(300_000, 10_000, 900_000),

  // One send at a time per process. Pacing between messages is the whole
  // point of the outreach policy, and parallel sends would defeat it.
  WA_SEND_CONCURRENCY: intFromEnv(1, 1, 16),
  WA_SESSION_CONCURRENCY: intFromEnv(4, 1, 32),

  // "silent" is pino's own off switch, used by the test suite.
  LOG_LEVEL: z.enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.string().default("development"),
});

export type WorkerConfig = z.infer<typeof envSchema> & {
  authEncryptionKey: Buffer;
};

function load(): WorkerConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid worker environment — ${detail}`);
  }
  if (parsed.data.WA_LOCK_RENEW_MS >= parsed.data.WA_LOCK_TTL_MS) {
    throw new Error("WA_LOCK_RENEW_MS must be smaller than WA_LOCK_TTL_MS, otherwise a lock expires before it is renewed");
  }
  return {
    ...parsed.data,
    authEncryptionKey: Buffer.from(parsed.data.WA_AUTH_ENCRYPTION_KEY, "hex"),
  };
}

let cached: WorkerConfig | undefined;

/** Validated environment. Throws on first call if anything is missing. */
export function getConfig(): WorkerConfig {
  cached ??= load();
  return cached;
}
