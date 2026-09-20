import type { NextRequest } from "next/server";
import type { Redis } from "ioredis";
import { createRedisConnection } from "@pitchmyweb/contracts";
import { RateLimitedError } from "../errors";

// Fixed-window rate limiting (Phase 4 code-review finding #12).
//
// Two stores behind one API, selected by RATE_LIMIT_STORE:
//
//   memory (default)  per-process Map. Fine for one instance, local dev and
//                     tests; counts reset on restart and are not shared.
//   redis             shared across every API instance (production). If
//                     Redis is unreachable, the limiter degrades to the
//                     memory store for that call instead of failing the
//                     request or silently disabling limits.
//
// Callers use `await rateLimit(key, limit, windowMs)` and never care which
// store is active. Keys are chosen by the caller (e.g. `login:ip:<ip>`) so
// different concerns are limited independently.

type Window = { count: number; windowStart: number };

const windows = new Map<string, Window>();
const MAX_MEMORY_KEYS = 50_000;

function sweepExpired(now: number, windowMs: number): void {
  for (const [key, window] of windows) {
    if (now - window.windowStart >= windowMs) windows.delete(key);
  }
}

/**
 * In-memory limiter. Throws RateLimitedError (429) once `limit` calls for
 * the same `key` have been made within `windowMs`.
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    // Bound memory: an unauthenticated caller can mint unlimited keys (e.g.
    // spoofed IPs), so expired windows are swept once the map gets large.
    if (!existing && windows.size >= MAX_MEMORY_KEYS) sweepExpired(now, windowMs);
    windows.set(key, { count: 1, windowStart: now });
    return;
  }

  if (existing.count >= limit) {
    throw new RateLimitedError();
  }

  existing.count += 1;
}

// ---------------------------------------------------------------------------
// Redis store
// ---------------------------------------------------------------------------

// INCR the window counter and set its expiry only when the window opens, so
// the window is fixed from the first hit (same semantics as the memory store).
const INCR_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`;

const REDIS_KEY_PREFIX = "rl:";

const globalForRateLimit = globalThis as unknown as { rateLimitRedis?: Redis; rateLimitLastWarn?: number };

function redisClient(): Redis {
  globalForRateLimit.rateLimitRedis ??= createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381", {
    // Fail fast instead of queueing: a rate-limit check must never make a
    // request hang while Redis is down.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    commandTimeout: 500,
  });
  return globalForRateLimit.rateLimitRedis;
}

export async function incrementRedisWindow(redis: Redis, key: string, windowMs: number): Promise<number> {
  const count = await redis.eval(INCR_WINDOW_SCRIPT, 1, `${REDIS_KEY_PREFIX}${key}`, String(windowMs));
  return Number(count);
}

function warnFallback(error: unknown): void {
  const now = Date.now();
  if (now - (globalForRateLimit.rateLimitLastWarn ?? 0) < 60_000) return;
  globalForRateLimit.rateLimitLastWarn = now;
  const reason = error instanceof Error ? error.name : "unknown";
  console.warn(JSON.stringify({ ts: new Date(now).toISOString(), level: "warn", event: "rate_limit.redis_unavailable", reason }));
}

export function rateLimitStore(env: Record<string, string | undefined> = process.env): "memory" | "redis" {
  return (env.RATE_LIMIT_STORE ?? "").trim().toLowerCase() === "redis" ? "redis" : "memory";
}

export type RateLimitOptions = { store?: "memory" | "redis"; redis?: Redis };

/**
 * Throws RateLimitedError (429) once `limit` calls for `key` have been made
 * within `windowMs`, using the configured store.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, options: RateLimitOptions = {}): Promise<void> {
  const store = options.store ?? rateLimitStore();
  if (store === "memory") {
    enforceRateLimit(key, limit, windowMs);
    return;
  }

  let count: number;
  try {
    count = await incrementRedisWindow(options.redis ?? redisClient(), key, windowMs);
  } catch (error) {
    warnFallback(error);
    enforceRateLimit(key, limit, windowMs);
    return;
  }
  if (count > limit) throw new RateLimitedError();
}

/**
 * Best-effort client IP from standard proxy headers, falling back to a
 * generated fingerprint so requests are still rate-limited (per-key, just
 * finer-grained) in environments (e.g. local dev, tests) where no proxy
 * sets these headers, rather than all requests sharing "unknown" and
 * incorrectly sharing a single rate-limit bucket.
 */
export function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  // Fallback: hash user-agent + accept-language for a stable per-browser
  // bucket in local dev without a proxy. This prevents all localhost
  // requests from colliding on "unknown".
  const ua = request.headers.get("user-agent") ?? "";
  const lang = request.headers.get("accept-language") ?? "";
  let hash = 0;
  for (let i = 0; i < ua.length; i++) hash = (hash << 5) - hash + ua.charCodeAt(i);
  for (let i = 0; i < lang.length; i++) hash = (hash << 5) - hash + lang.charCodeAt(i);
  return `local-${Math.abs(hash).toString(36)}`;
}
