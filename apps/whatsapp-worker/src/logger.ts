import pino from "pino";
import { getConfig } from "./config.js";

// Everything this worker handles is sensitive: the credential blobs are the
// account itself, and the message bodies are a user's outreach copy sent to
// a real business. The redaction list below is the safety net — the code
// still avoids logging those fields in the first place.
const REDACTED = [
  "creds",
  "*.creds",
  "authState",
  "*.authState",
  "ciphertext",
  "*.ciphertext",
  "iv",
  "*.iv",
  "authTag",
  "*.authTag",
  "body",
  "*.body",
  "text",
  "*.text",
  "qr",
  "*.qr",
  "qrDataUrl",
  "*.qrDataUrl",
  "code",
  "*.code",
  "pairingCode",
  "*.pairingCode",
  "WA_AUTH_ENCRYPTION_KEY",
  "*.WA_AUTH_ENCRYPTION_KEY",
];

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { workerId: config.WORKER_ID },
  redact: { paths: REDACTED, censor: "[redacted]" },
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
});

export type Logger = typeof logger;

/**
 * Baileys expects a logger with its own ILogger shape (it calls `.child()`
 * and the level methods). Pino satisfies that structurally, so the socket
 * gets a child logger tagged with the account it belongs to — which also
 * means Baileys' own internal logging inherits the redaction rules above.
 */
export function baileysLogger(accountId: string) {
  return logger.child({ accountId, source: "baileys" });
}

/**
 * Turns any thrown value into a short, safe string for `lastError` /
 * `failureReason` columns and for user-facing events. Never includes a
 * stack trace, and truncates so a pathological provider error cannot bloat
 * a database row.
 */
export function sanitizeError(error: unknown, fallback = "Unexpected error"): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return fallback;
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned;
}
