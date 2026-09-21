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

/**
 * Where the current QR for an account is parked, and for how long.
 *
 * The QR reaches the browser over pub/sub, which is fire-and-forget: it is
 * published once, a few seconds after the connect command, and a client whose
 * stream is not yet established at that instant never receives it. The status
 * poll cannot recover it either, since a status carries no image — leaving a
 * QR screen with no QR on it and no way forward.
 *
 * Parking a copy makes the poll a real fallback. The TTL outlives the roughly
 * 60s WhatsApp allows a QR to be scanned, so the cached copy expires slightly
 * after the code it depicts stops working, and never long enough to show a
 * stale one on a later attempt.
 */
export const WHATSAPP_QR_TTL_SECONDS = 90;

export function whatsappQrKey(accountId: string): string {
  return `wa:qr:${accountId}`;
}
