import { Redis, type RedisOptions } from "ioredis";

// Redis key namespace. Every key this system writes starts with `wa:` so a
// shared Redis instance stays legible and `KEYS wa:*` is enough to see
// everything the WhatsApp layer owns.

/** Pub/sub channel carrying WaEvents for one account. */
export function eventsChannel(accountId: string): string {
  return `wa:events:${accountId}`;
}

/** Pub/sub channel carrying DiscoveryEvents for one campaign execution. */
export function discoveryEventsChannel(executionId: string): string {
  return `discovery:events:${executionId}`;
}

/** Distributed lock proving a single worker owns an account's socket. */
export function sessionLockKey(accountId: string): string {
  return `wa:session:${accountId}`;
}

/**
 * BullMQ requires `maxRetriesPerRequest: null` on every connection it owns
 * (blocking commands must not be aborted by ioredis's own retry cap), and
 * it throws at startup if that is not set. Creating connections through one
 * helper means no caller can forget.
 */
export function createRedisConnection(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...options,
  });
}
