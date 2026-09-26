import { createRedisConnection, whatsappPairingKey, whatsappQrKey } from "@pitchmyweb/contracts";

// One connection per process, reused across requests. Next reloads modules in
// development, so it hangs off globalThis to avoid leaking a socket per reload
// — the same pattern the rate limiter and the queues use.
const globalForQr = globalThis as unknown as { whatsappQrRedis?: ReturnType<typeof createRedisConnection> };

function client(): ReturnType<typeof createRedisConnection> {
  globalForQr.whatsappQrRedis ??= createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
  return globalForQr.whatsappQrRedis;
}

/**
 * The QR the worker parked for this account, or null once it has expired.
 *
 * Returning null is always safe: the caller is a status poll, and a missing
 * QR means the client simply keeps waiting rather than being shown a stale
 * code that WhatsApp has already stopped accepting.
 */
export async function readCachedQr(accountId: string): Promise<string | null> {
  try {
    return await client().get(whatsappQrKey(accountId));
  } catch {
    // Redis being unreachable must not take the status endpoint down with
    // it; the stream is still the primary path for this value.
    return null;
  }
}

/**
 * The pairing code the worker parked for this account, or null once it has
 * expired. Same reasoning as the QR: the code reaches the browser over a
 * one-shot publish, and without this a page whose stream was not open at
 * that instant would never show it.
 */
export async function readCachedPairingCode(accountId: string): Promise<{ code: string; expiresAt: string } | null> {
  try {
    const raw = await client().get(whatsappPairingKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; expiresAt?: unknown };
    return typeof parsed.code === "string" && typeof parsed.expiresAt === "string" ? { code: parsed.code, expiresAt: parsed.expiresAt } : null;
  } catch {
    return null;
  }
}
