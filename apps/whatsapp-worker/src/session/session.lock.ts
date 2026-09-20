import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { sessionLockKey } from "@pitchmyweb/contracts";

// Exactly one process may hold a live socket for an account at a time.
// Two sockets sharing one set of Signal credentials corrupt each other's
// ratchet state, which shows up later as undecryptable messages and, in the
// worst case, as WhatsApp banning the number. The lock is what makes that
// impossible rather than merely unlikely.
//
// Design:
//   acquire  SET key <token> NX PX ttl        — only if nobody holds it
//   renew    Lua: PEXPIRE only if value == my token
//   release  Lua: DEL only if value == my token
//
// The compare-and-act pairs must be atomic, hence Lua: a plain GET-then-DEL
// could delete a lock that expired between the two commands and was already
// re-acquired by another worker.

const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export type SessionLockOptions = {
  ttlMs: number;
  renewIntervalMs: number;
  /** Called when a renewal fails — the session must close its socket. */
  onLost?: (accountId: string) => void;
};

export class SessionLock {
  private renewTimer: NodeJS.Timeout | undefined;
  private released = false;

  private constructor(
    private readonly redis: Redis,
    readonly accountId: string,
    readonly token: string,
    private readonly options: SessionLockOptions,
  ) {}

  /**
   * Returns a held lock, or null when another worker owns the session.
   * Null is an ordinary outcome, not an error: it means "somebody else is
   * already doing this", and the caller simply declines the work.
   */
  static async acquire(redis: Redis, accountId: string, ownerId: string, options: SessionLockOptions): Promise<SessionLock | null> {
    // The token identifies this specific acquisition, not just this
    // worker: a worker that lost and re-took the lock must not be able to
    // renew or release the earlier holder's lock with a stale handle.
    const token = `${ownerId}:${randomUUID()}`;
    const result = await redis.set(sessionLockKey(accountId), token, "PX", options.ttlMs, "NX");
    if (result !== "OK") return null;

    const lock = new SessionLock(redis, accountId, token, options);
    lock.startRenewing();
    return lock;
  }

  /** Who currently holds the lock, if anyone. Diagnostics only. */
  static async currentOwner(redis: Redis, accountId: string): Promise<string | null> {
    return redis.get(sessionLockKey(accountId));
  }

  private startRenewing(): void {
    this.renewTimer = setInterval(() => {
      void this.renewOnce();
    }, this.options.renewIntervalMs);
    // Never hold the process open just to keep renewing a lock.
    this.renewTimer.unref?.();
  }

  private async renewOnce(): Promise<void> {
    if (this.released) return;
    let renewed = false;
    try {
      const result = await this.redis.eval(RENEW_SCRIPT, 1, sessionLockKey(this.accountId), this.token, String(this.options.ttlMs));
      renewed = result === 1;
    } catch {
      // A Redis error is indistinguishable from a lost lock as far as
      // safety goes: if we cannot prove we still hold it, we must behave
      // as though we do not.
      renewed = false;
    }
    if (!renewed) {
      this.stopRenewing();
      this.released = true;
      this.options.onLost?.(this.accountId);
    }
  }

  /** Forces one renewal now. Returns false if the lock is no longer ours. */
  async renew(): Promise<boolean> {
    if (this.released) return false;
    const result = await this.redis.eval(RENEW_SCRIPT, 1, sessionLockKey(this.accountId), this.token, String(this.options.ttlMs));
    return result === 1;
  }

  private stopRenewing(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = undefined;
    }
  }

  get isHeld(): boolean {
    return !this.released;
  }

  /** Releases the lock if (and only if) it is still ours. */
  async release(): Promise<void> {
    this.stopRenewing();
    if (this.released) return;
    this.released = true;
    try {
      await this.redis.eval(RELEASE_SCRIPT, 1, sessionLockKey(this.accountId), this.token);
    } catch {
      // Nothing useful to do: the TTL will expire the lock shortly.
    }
  }
}
