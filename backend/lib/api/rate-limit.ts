import type { NextRequest } from "next/server";
import { RateLimitedError } from "../errors";

// Minimal in-process fixed-window rate limiter (Phase 4 code-review finding
// #12). Deliberately the smallest reasonable implementation (Rule 10): a
// single in-memory Map, no new dependency, no external service. This is a
// real limitation, not a hidden one — state is per-process and resets on
// restart, and it does not coordinate across multiple instances behind a
// load balancer. A production multi-instance deployment should replace
// this with a shared store (e.g. Redis-backed) keyed the same way; the
// call sites (checkRateLimit) would not need to change.

type Window = { count: number; windowStart: number };

const windows = new Map<string, Window>();

/**
 * Throws RateLimitedError (429) once `limit` calls for the same `key` have
 * been made within `windowMs`. Callers choose the key (e.g. `login:<ip>:
 * <email>`) so different concerns can be limited independently.
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    windows.set(key, { count: 1, windowStart: now });
    return;
  }

  if (existing.count >= limit) {
    throw new RateLimitedError();
  }

  existing.count += 1;
}

/**
 * Best-effort client IP from standard proxy headers, falling back to a
 * constant so requests are still rate-limited (per-key, just coarser) in
 * environments (e.g. local dev, tests) where no proxy sets these headers,
 * rather than silently bypassing the limiter.
 */
export function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
