import { afterAll, describe, expect, it, vi } from "vitest";
import { createRedisConnection } from "@pitchmyweb/contracts";
import { RateLimitUnavailableError, RateLimitedError } from "../errors";
import { createRateLimitRedis, rateLimit, rateLimitStore } from "./rate-limit";

// Real Redis from infrastructure/docker (the WhatsApp tests need it too).
const redis = createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381", { maxRetriesPerRequest: 1 });
const unique = (label: string) => `test:${label}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

afterAll(async () => {
  await redis.quit();
});

describe("rateLimitStore", () => {
  it("defaults to memory and only switches on an explicit redis value", () => {
    expect(rateLimitStore({})).toBe("memory");
    expect(rateLimitStore({ RATE_LIMIT_STORE: "Redis " })).toBe("redis");
    expect(rateLimitStore({ RATE_LIMIT_STORE: "memcached" })).toBe("memory");
  });
});

describe("rateLimit (memory store)", () => {
  it("allows `limit` calls per window, then throws", async () => {
    const key = unique("mem");
    for (let i = 0; i < 3; i += 1) await rateLimit(key, 3, 60_000, { store: "memory" });
    await expect(rateLimit(key, 3, 60_000, { store: "memory" })).rejects.toThrow(RateLimitedError);
  });

  it("refuses the memory store in production", async () => {
    vi.stubEnv("APP_ENV", "production");
    try {
      await expect(rateLimit(unique("production-memory"), 1, 60_000, { store: "memory" })).rejects.toThrow(RateLimitUnavailableError);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("rateLimit (redis store)", () => {
  it("allows `limit` calls per window, then throws, and sets an expiry on the key", async () => {
    const key = unique("redis");
    for (let i = 0; i < 3; i += 1) await rateLimit(key, 3, 60_000, { store: "redis", redis });
    await expect(rateLimit(key, 3, 60_000, { store: "redis", redis })).rejects.toThrow(RateLimitedError);

    const ttl = await redis.pttl(`rl:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it("shares counts between independent connections (i.e. between API instances)", async () => {
    const key = unique("shared");
    const other = createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381", { maxRetriesPerRequest: 1 });
    try {
      await rateLimit(key, 2, 60_000, { store: "redis", redis });
      await rateLimit(key, 2, 60_000, { store: "redis", redis: other });
      await expect(rateLimit(key, 2, 60_000, { store: "redis", redis })).rejects.toThrow(RateLimitedError);
    } finally {
      await other.quit();
    }
  });

  it("opens a fresh window after expiry", async () => {
    const key = unique("expiry");
    await rateLimit(key, 1, 50, { store: "redis", redis });
    await expect(rateLimit(key, 1, 50, { store: "redis", redis })).rejects.toThrow(RateLimitedError);
    await new Promise((r) => setTimeout(r, 80));
    await expect(rateLimit(key, 1, 50, { store: "redis", redis })).resolves.toBeUndefined();
  });

  // The shared `redis` above is connected long before any test runs, so it
  // never exercised the production connection's first command.
  it("serves the first check on a brand-new production connection", async () => {
    const fresh = createRateLimitRedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
    try {
      await expect(rateLimit(unique("fresh"), 5, 60_000, { store: "redis", redis: fresh })).resolves.toBeUndefined();
    } finally {
      await fresh.quit();
    }
  });

  it("still fails fast when Redis is unreachable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unreachable = createRateLimitRedis("redis://127.0.0.1:1");
    const started = Date.now();
    try {
      await expect(rateLimit(unique("unreachable"), 5, 60_000, { store: "redis", redis: unreachable })).rejects.toThrow(RateLimitUnavailableError);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      unreachable.disconnect();
      warn.mockRestore();
    }
  });

  it("fails closed when Redis fails instead of weakening protection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = { eval: vi.fn(async () => { throw new Error("ECONNREFUSED"); }) } as never;
    const key = unique("fallback");
    await expect(rateLimit(key, 1, 60_000, { store: "redis", redis: broken })).rejects.toThrow(RateLimitUnavailableError);
    warn.mockRestore();
  });
});
