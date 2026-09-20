import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createRedisConnection, sessionLockKey } from "@pitchmyweb/contracts";
import { SessionLock } from "./session.lock.js";

// Against a real Redis, not a fake. The whole property under test is
// "SET NX and a Lua compare-and-delete behave atomically" — a hand-rolled
// double would be asserting that the test double works, which proves
// nothing about the invariant that stops two workers sharing one WhatsApp
// credential store.

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6381";
const redis = createRedisConnection(redisUrl);

const options = { ttlMs: 5_000, renewIntervalMs: 60_000 };
const created: string[] = [];

function accountId(label: string): string {
  const id = `test-lock-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  created.push(id);
  return id;
}

afterEach(async () => {
  if (created.length > 0) {
    await redis.del(...created.map(sessionLockKey));
    created.length = 0;
  }
});

afterAll(async () => {
  await redis.quit();
});

describe("SessionLock", () => {
  it("acquires a free lock", async () => {
    const id = accountId("free");
    const lock = await SessionLock.acquire(redis, id, "worker-1", options);
    expect(lock).not.toBeNull();
    expect(lock!.isHeld).toBe(true);
    await lock!.release();
  });

  it("refuses a lock another worker holds", async () => {
    const id = accountId("contended");
    const first = await SessionLock.acquire(redis, id, "worker-1", options);
    const second = await SessionLock.acquire(redis, id, "worker-2", options);
    expect(first).not.toBeNull();
    // Null, not an exception: another worker already owning the session is
    // an ordinary outcome that the caller simply declines.
    expect(second).toBeNull();
    await first!.release();
  });

  it("lets a second worker take the lock after release", async () => {
    const id = accountId("handover");
    const first = await SessionLock.acquire(redis, id, "worker-1", options);
    await first!.release();
    const second = await SessionLock.acquire(redis, id, "worker-2", options);
    expect(second).not.toBeNull();
    await second!.release();
  });

  it("renews its own lock and extends the ttl", async () => {
    const id = accountId("renew");
    const lock = await SessionLock.acquire(redis, id, "worker-1", { ...options, ttlMs: 2_000 });
    const before = await redis.pttl(sessionLockKey(id));
    expect(await lock!.renew()).toBe(true);
    const after = await redis.pttl(sessionLockKey(id));
    expect(after).toBeGreaterThanOrEqual(before - 50);
    await lock!.release();
  });

  // The stolen-lock case: if another worker has taken over (because this
  // one's TTL lapsed), the renewal must fail so the stale holder closes its
  // socket instead of quietly continuing to believe it owns the session.
  it("fails to renew a lock that another worker has taken", async () => {
    const id = accountId("stolen");
    const lock = await SessionLock.acquire(redis, id, "worker-1", options);
    await redis.set(sessionLockKey(id), "worker-2:stolen");
    expect(await lock!.renew()).toBe(false);
  });

  it("does not delete a lock that is no longer ours", async () => {
    const id = accountId("no-steal-delete");
    const lock = await SessionLock.acquire(redis, id, "worker-1", options);
    await redis.set(sessionLockKey(id), "worker-2:took-over");

    await lock!.release();

    // The other worker's value must survive: a naive GET-then-DEL would
    // have removed a lock this worker no longer held.
    expect(await redis.get(sessionLockKey(id))).toBe("worker-2:took-over");
  });

  it("expires on its own when a worker dies without releasing", async () => {
    const id = accountId("ttl");
    const lock = await SessionLock.acquire(redis, id, "worker-1", { ttlMs: 300, renewIntervalMs: 60_000 });
    expect(lock).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await redis.get(sessionLockKey(id))).toBeNull();
    const second = await SessionLock.acquire(redis, id, "worker-2", options);
    expect(second).not.toBeNull();
    await second!.release();
  });

  it("gives each acquisition a distinct token", async () => {
    const first = accountId("token-a");
    const second = accountId("token-b");
    const lockA = await SessionLock.acquire(redis, first, "worker-1", options);
    const lockB = await SessionLock.acquire(redis, second, "worker-1", options);
    // Same worker, different acquisitions: a stale handle must not be able
    // to renew or release the newer one.
    expect(lockA!.token).not.toBe(lockB!.token);
    await lockA!.release();
    await lockB!.release();
  });

  it("reports the current owner", async () => {
    const id = accountId("owner");
    expect(await SessionLock.currentOwner(redis, id)).toBeNull();
    const lock = await SessionLock.acquire(redis, id, "worker-7", options);
    expect(await SessionLock.currentOwner(redis, id)).toContain("worker-7");
    await lock!.release();
  });
});
