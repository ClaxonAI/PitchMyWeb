import QRCode from "qrcode";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { PrismaClient, WhatsAppStatus } from "@pitchmyweb/db";
import type { ReconnectJob, WaStatus } from "@pitchmyweb/contracts";
import { WHATSAPP_QR_TTL_SECONDS, whatsappQrKey } from "@pitchmyweb/contracts";
import type { WorkerConfig } from "../config.js";
import { logger, sanitizeError } from "../logger.js";
import type { ProviderEvents, WhatsAppProvider } from "../providers/whatsapp.provider.js";
import { EventPublisher, nowIso } from "../realtime/publisher.js";
import type { InboundHandler } from "../workers/inbound.handler.js";
import type { AuthStateRepository } from "./auth-state.repository.js";
import { SessionLock } from "./session.lock.js";

// Owns every live session in this process.
//
// Two invariants hold everything together:
//
//  1. A socket exists only while this worker holds `wa:session:<id>`. The
//     lock is taken before connecting and released after closing, and if a
//     renewal ever fails the socket is torn down immediately — better a
//     disconnected account than two workers sharing one credential store.
//
//  2. Every status change is written to Postgres first, then published to
//     Redis. Postgres is what a page load reads and what restoreAll() trusts
//     after a restart; the pub/sub event only saves the browser a poll. Doing
//     it the other way round would let a UI show CONNECTED for a session the
//     database never recorded.

type Live = {
  lock: SessionLock;
  /** Guards against two connect commands racing for the same account. */
  connecting: boolean;
};

export class SessionManager {
  private readonly live = new Map<string, Live>();
  private readonly publisher: EventPublisher;

  constructor(
    private readonly db: PrismaClient,
    private readonly redis: Redis,
    private readonly lockRedis: Redis,
    private readonly provider: WhatsAppProvider,
    private readonly authRepo: AuthStateRepository,
    private readonly inbound: InboundHandler,
    private readonly reconnectQueue: Queue<ReconnectJob>,
    private readonly config: WorkerConfig,
  ) {
    this.publisher = new EventPublisher(redis);
  }

  // -------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------

  /**
   * The single write path for session state: Postgres first, Redis second.
   * `lastError` is cleared on every non-ERROR transition so a stale message
   * cannot outlive the failure that produced it.
   */
  private async setStatus(accountId: string, status: WaStatus, detail?: { error?: string; phoneNumber?: string; displayName?: string }): Promise<void> {
    const now = new Date();
    await this.db.whatsAppAccount.update({
      where: { id: accountId },
      data: {
        status: status as WhatsAppStatus,
        lastError: status === "ERROR" ? (detail?.error ?? "Unknown error") : null,
        ...(detail?.phoneNumber ? { phoneNumber: detail.phoneNumber } : {}),
        ...(detail?.displayName ? { displayName: detail.displayName } : {}),
        ...(status === "CONNECTED" ? { lastConnectedAt: now, lastSeenAt: now } : {}),
      },
    });
    await this.publisher.publish({ type: "STATUS", accountId, status, at: nowIso() });
    if (status === "ERROR") {
      await this.publisher.publish({ type: "ERROR", accountId, message: detail?.error ?? "Unknown error", at: nowIso() });
    }
  }

  // -------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------

  /**
   * Opens a session. Returns false when another worker already owns it —
   * an ordinary outcome, not a failure.
   */
  async connect(accountId: string): Promise<boolean> {
    const existing = this.live.get(accountId);
    if (existing) {
      // Already ours. A repeat connect (user clicked twice) is a no-op
      // rather than a socket churn.
      return true;
    }

    const lock = await SessionLock.acquire(this.lockRedis, accountId, this.config.WORKER_ID, {
      ttlMs: this.config.WA_LOCK_TTL_MS,
      renewIntervalMs: this.config.WA_LOCK_RENEW_MS,
      onLost: (id) => {
        logger.warn({ accountId: id }, "session lock lost; closing socket");
        void this.forceClose(id, "Lost ownership of this session");
      },
    });
    if (!lock) {
      logger.info({ accountId }, "another worker owns this session; skipping connect");
      return false;
    }

    this.live.set(accountId, { lock, connecting: true });

    try {
      await this.setStatus(accountId, "CONNECTING");
      await this.provider.connect(accountId, this.eventsFor(accountId));
      const entry = this.live.get(accountId);
      if (entry) entry.connecting = false;
      return true;
    } catch (error) {
      const message = sanitizeError(error, "Could not start the WhatsApp connection");
      logger.error({ accountId, err: message }, "connect failed");
      await this.releaseLock(accountId);
      await this.setStatus(accountId, "ERROR", { error: message });
      return false;
    }
  }

  /** Connects if needed, then asks WhatsApp for a pairing code. */
  async requestPairingCode(accountId: string, phoneNumber: string): Promise<void> {
    if (!this.live.has(accountId)) {
      const started = await this.connect(accountId);
      if (!started) return;
    }
    try {
      // The socket needs a moment after opening before WhatsApp will
      // answer a pairing-code request; Baileys surfaces that as a thrown
      // error, which the retry below absorbs.
      await this.withRetry(() => this.provider.requestPairingCode(accountId, phoneNumber));
    } catch (error) {
      const message = sanitizeError(error, "Could not request a pairing code");
      logger.error({ accountId, err: message }, "pairing code request failed");
      await this.setStatus(accountId, "ERROR", { error: message });
    }
  }

  /**
   * User-initiated disconnect: unlink on WhatsApp, wipe the stored
   * credentials, and cancel anything still queued for this account. The
   * account row itself stays, so the user can relink without losing its
   * message history.
   */
  async disconnect(accountId: string): Promise<void> {
    try {
      await this.provider.disconnect(accountId, { logout: true });
    } catch (error) {
      logger.warn({ accountId, err: sanitizeError(error) }, "provider disconnect failed; continuing cleanup");
    }
    await this.authRepo.removeAll(accountId);
    await this.cancelQueuedMessages(accountId, "Account disconnected");
    await this.releaseLock(accountId);
    await this.setStatus(accountId, "DISCONNECTED");
  }

  /** Closes the socket without touching stored credentials. */
  private async forceClose(accountId: string, reason: string): Promise<void> {
    try {
      await this.provider.disconnect(accountId);
    } catch (error) {
      logger.warn({ accountId, err: sanitizeError(error) }, "force close failed");
    }
    // releaseLock, not a bare delete: it both drops the registry entry and
    // releases the Redis lock, and dropping the entry first would leave the
    // lock held with no socket behind it.
    await this.releaseLock(accountId);
    try {
      await this.setStatus(accountId, "ERROR", { error: reason });
    } catch (error) {
      logger.error({ accountId, err: sanitizeError(error) }, "could not record forced close");
    }
  }

  // -------------------------------------------------------------------
  // Provider callbacks
  // -------------------------------------------------------------------

  private eventsFor(accountId: string): ProviderEvents {
    return {
      onStatus: async (status, detail) => {
        // CONNECTING and CONNECTED are already written by the paths that
        // cause them, with the extra detail (phone number, timestamps)
        // those transitions carry.
        if (status === "CONNECTING" || status === "CONNECTED") return;
        // ERROR reported by the provider always means its socket is gone —
        // an unscanned QR expiring is the common case. The lock has to be
        // released here, because that close never reaches onClosed (the
        // provider marks it deliberate). Without this the registry keeps a
        // live entry with no socket behind it, and every later connect
        // returns "already connected" and does nothing, leaving the
        // account stuck at CONNECTING forever.
        if (status === "ERROR") await this.releaseLock(accountId);
        await this.setStatus(accountId, status, detail);
      },

      onQr: async (qr) => {
        // The raw QR string is a live credential-exchange token. Rendering
        // it to an image here means the browser receives something it can
        // only display, and no Baileys concept ever reaches the client.
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320, errorCorrectionLevel: "M" });
        await this.publisher.publish({ type: "QR_READY", accountId, qrDataUrl, at: nowIso() });
        // Parked as well as published. The publish is fire-and-forget, so a
        // client whose stream is not open at this instant never sees it, and
        // the status poll carries no image to fall back on — which is how a
        // QR screen ends up permanently blank. The status endpoint reads this
        // copy, so a late or reconnecting client can still pick it up.
        await this.redis.set(whatsappQrKey(accountId), qrDataUrl, "EX", WHATSAPP_QR_TTL_SECONDS);
        // Marks the boundary between "generated" and "delivered". A QR that
        // never appears on screen is otherwise indistinguishable from one
        // that was never produced, and the two have entirely different
        // causes — the length is here because it confirms a real image was
        // rendered rather than an empty string.
        logger.info({ accountId, qrDataUrlLength: qrDataUrl.length }, "QR published to subscribers");
      },

      onPairingCode: async (code) => {
        await this.publisher.publish({ type: "PAIRING_CODE", accountId, code, at: nowIso() });
      },

      onConnected: async ({ phoneNumber, displayName }) => {
        await this.setStatus(accountId, "CONNECTED", { phoneNumber, displayName });
        await this.publisher.publish({ type: "CONNECTED", accountId, phoneNumber, at: nowIso() });
      },

      onLoggedOut: async (reason) => {
        // WhatsApp revoked this device: the stored keys are now useless,
        // and keeping them would mean retrying forever against credentials
        // that can never authenticate again.
        await this.authRepo.removeAll(accountId);
        await this.cancelQueuedMessages(accountId, "Account was unlinked");
        await this.releaseLock(accountId);
        await this.setStatus(accountId, "LOGGED_OUT");
        await this.publisher.publish({ type: "LOGGED_OUT", accountId, at: nowIso() });
        logger.info({ accountId, reason }, "account logged out");
      },

      onClosed: async (outcome) => {
        if (outcome.action === "logged_out") return; // already handled above
        // No `this.live.delete` here: releaseLock reads the entry to find
        // the lock it must release, so removing it first would silently
        // turn every release below into a no-op and leak the lock until
        // its TTL lapsed.
        if (outcome.action === "fatal") {
          await this.releaseLock(accountId);
          await this.setStatus(accountId, "ERROR", { error: outcome.reason });
          return;
        }
        // Transient. The lock is released so whichever worker picks up the
        // reconnect job can take ownership cleanly.
        await this.releaseLock(accountId);
        await this.setStatus(accountId, "RECONNECTING", { error: outcome.reason });
        await this.scheduleReconnect(accountId, 1);
      },

      onIncomingText: async ({ from, text }) => {
        await this.inbound.handleIncomingText(from, text);
      },

      onReceipt: async ({ providerMessageId, status }) => {
        await this.inbound.handleReceipt(providerMessageId, status);
      },
    };
  }

  // -------------------------------------------------------------------
  // Reconnect + restore
  // -------------------------------------------------------------------

  /**
   * Exponential backoff, capped. BullMQ holds the delay, so a pending
   * reconnect survives this process dying — no in-memory timer to lose.
   */
  async scheduleReconnect(accountId: string, attempt: number): Promise<void> {
    if (attempt > this.config.WA_MAX_RECONNECT_ATTEMPTS) {
      await this.setStatus(accountId, "ERROR", {
        error: "Could not reconnect to WhatsApp. Please link the account again.",
      });
      return;
    }
    const delay = Math.min(this.config.WA_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), this.config.WA_RECONNECT_MAX_DELAY_MS);
    await this.reconnectQueue.add(
      "reconnect",
      { accountId, attempt },
      {
        delay,
        // One pending reconnect per account per attempt: a burst of close
        // events must not fan out into a burst of connections. Hyphens, not
        // colons: BullMQ rejects a custom id containing ":" because it
        // builds its own Redis keys with that separator.
        jobId: `reconnect-${accountId}-${attempt}`,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    logger.info({ accountId, attempt, delay }, "scheduled reconnect");
  }

  /** Handles one reconnect job: try to connect, or schedule the next attempt. */
  async reconnect(accountId: string, attempt: number): Promise<void> {
    const account = await this.db.whatsAppAccount.findUnique({ where: { id: accountId } });
    // The user may have disconnected or relinked while the job waited.
    if (!account || account.status === "DISCONNECTED" || account.status === "LOGGED_OUT") {
      logger.info({ accountId, status: account?.status }, "skipping reconnect; account no longer wants one");
      return;
    }
    const connected = await this.connect(accountId);
    if (!connected && !this.live.has(accountId)) {
      await this.scheduleReconnect(accountId, attempt + 1);
    }
  }

  /**
   * Rebuilds sessions after a restart. Accounts that were CONNECTED or
   * RECONNECTING when the process stopped are expected to come back without
   * the user touching anything — the credentials are in Postgres, so no QR
   * scan is involved.
   */
  async restoreAll(): Promise<void> {
    // CONNECTING is included, but conditionally. A process that died
    // mid-connect leaves an account stuck in it, and without this such an
    // account is never restored and never retried — the user has to notice
    // and click Connect again. Whether it is restorable depends on what is
    // stored: credentials present means this was a real session coming
    // back, none means an abandoned link attempt that never got past the
    // QR, and opening a socket for that would only produce a QR nobody is
    // watching.
    const candidates = await this.db.whatsAppAccount.findMany({
      where: { status: { in: ["CONNECTED", "RECONNECTING", "CONNECTING"] } },
      select: { id: true, status: true, _count: { select: { authKeys: true } } },
    });

    const accounts: Array<{ id: string }> = [];
    for (const candidate of candidates) {
      if (candidate.status === "CONNECTING" && candidate._count.authKeys === 0) {
        await this.db.whatsAppAccount.update({
          where: { id: candidate.id },
          data: { status: "DISCONNECTED" },
        });
        logger.info({ accountId: candidate.id }, "cleared an abandoned link attempt");
        continue;
      }
      accounts.push({ id: candidate.id });
    }

    if (accounts.length === 0) {
      logger.info("no WhatsApp sessions to restore");
      return;
    }
    logger.info({ count: accounts.length }, "restoring WhatsApp sessions");
    for (const account of accounts) {
      try {
        const connected = await this.connect(account.id);
        if (!connected) {
          // The lock is held. Usually that means another worker genuinely
          // owns the session and this one should stay out of the way — but
          // after a crash it is this worker's *own* stale lock, still
          // inside its TTL. Giving up here would leave the account
          // unrestored until a user noticed; scheduling a reconnect covers
          // both cases, since the retry re-checks the account and simply
          // declines again if somebody else really does own it.
          await this.scheduleReconnect(account.id, 1);
          continue;
        }
      } catch (error) {
        // One bad account must not stop the others from coming back.
        logger.error({ accountId: account.id, err: sanitizeError(error) }, "failed to restore session");
      }
    }
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /** True when this process holds a connected socket for the account. */
  isConnected(accountId: string): boolean {
    return this.live.has(accountId) && this.provider.getStatus(accountId) === "CONNECTED";
  }

  private async cancelQueuedMessages(accountId: string, reason: string): Promise<void> {
    const { count } = await this.db.whatsAppMessage.updateMany({
      where: { accountId, status: "QUEUED" },
      data: { status: "CANCELLED", failureReason: reason },
    });
    if (count > 0) {
      logger.info({ accountId, count }, "cancelled queued messages");
    }
  }

  private async releaseLock(accountId: string): Promise<void> {
    const entry = this.live.get(accountId);
    this.live.delete(accountId);
    await entry?.lock.release();
  }

  private async withRetry<T>(operation: () => Promise<T>, attempts = 3, delayMs = 1_500): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError;
  }

  /**
   * Shutdown: close every socket and release every lock, but keep the
   * stored credentials and leave each account CONNECTED/RECONNECTING in the
   * database so the next boot restores it.
   */
  async shutdown(): Promise<void> {
    const accountIds = [...this.live.keys()];
    for (const accountId of accountIds) {
      try {
        await this.provider.disconnect(accountId);
      } catch (error) {
        logger.warn({ accountId, err: sanitizeError(error) }, "error closing socket during shutdown");
      }
      await this.releaseLock(accountId);
    }
  }
}
