import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "discovery-worker" },
  redact: { paths: ["INTERNAL_JOBS_SECRET", "*.INTERNAL_JOBS_SECRET", "authorization", "*.authorization"], censor: "[redacted]" },
  ...(process.env.NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
});

/** Error text safe for logs and failure reasons: first line, bounded. */
export function sanitizeError(error: unknown, fallback = "Unexpected error"): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  return (message.split("\n")[0] ?? fallback).slice(0, 200);
}
