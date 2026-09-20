import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Queue } from "bullmq";
import { createRedisConnection, sessionLockKey, type ReconnectJob, type WaStatus } from "@pitchmyweb/contracts";
import { getConfig } from "../config.js";
import { disconnectDb, getDb } from "../db.js";
import { createTestAccount, type TestFixture } from "../testing/helpers.js";
import { InboundHandler } from "../workers/inbound.handler.js";
import type { ProviderEvents, WhatsAppProvider } from "../providers/whatsapp.provider.js";
import { PostgresAuthStateRepository } from "./auth-state.repository.js";
import { SessionManager } from "./session.manager.js";

// The provider is faked here on purpose: these tests are about what the
// manager does with the lock and the account row in response to provider
// callbacks, and a real Baileys socket would make those transitions
// untriggerable. Redis and Postgres are real, because the lock and the
// status row are exactly what is being asserted.

const config = getConfig();
const db = getDb();
const redis = createRedisConnection(config.REDIS_URL);

class FakeProvider implements WhatsAppProvider {
  events: ProviderEvents | undefined;
  connectCalls = 0;
  /** Accounts this provider was asked to connect, in order. */
  connectedAccountIds: string[] = [];
  disconnectCalls: Array<{ accountId: string; logout: boolean }> = [];
  status: WaStatus = "DISCONNECTED";

  async connect(accountId: string, events: ProviderEvents) {
    this.connectCalls += 1;
    this.connectedAccountIds.push(accountId);
    this.events = events;
    this.status = "CONNECTING";
    return { restored: false };
  }

  async requestPairingCode() {
    return "ABCD1234";
  }

  async disconnect(accountId: string, options: { logout?: boolean } = {}) {
    this.disconnectCalls.push({ accountId, logout: options.logout ?? false });
    this.status = "DISCONNECTED";
  }

  getStatus() {
    return this.status;
  }

  async sendText() {
    return { providerMessageId: "fake" };
  }

  async sendVideo() {
    return { providerMessageId: "fake-video" };
  }

  async checkNumber() {
    return { exists: true };
  }
}

const scheduledReconnects: ReconnectJob[] = [];
const recordingQueue = {
  add: async (_name: string, data: ReconnectJob) => {
    scheduledReconnects.push(data);
    return undefined;
  },
} as unknown as Queue<ReconnectJob>;

const fixtures: TestFixture[] = [];

async function setup(label: string) {
  const fixture = await createTestAccount(label, "DISCONNECTED" as "CONNECTED");
  fixtures.push(fixture);
  const provider = new FakeProvider();
  const manager = new SessionManager(
    db,
    redis,
    redis,
    provider,
    new PostgresAuthStateRepository(db, config.authEncryptionKey, 1),
    new InboundHandler(db),
    recordingQueue,
    config,
  );
  return { fixture, provider, manager };
}

async function statusOf(accountId: string): Promise<string> {
  const account = await db.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } });
  return account.status;
}

afterEach(async () => {
  scheduledReconnects.length = 0;
  await Promise.all(fixtures.map((f) => redis.del(sessionLockKey(f.accountId))));
  await Promise.all(fixtures.map((f) => f.cleanup()));
  fixtures.length = 0;
});

afterAll(async () => {
  await redis.quit();
  await disconnectDb();
});

describe("SessionManager", () => {
  it("takes the lock and marks the account CONNECTING", async () => {
    const { fixture, provider, manager } = await setup("connect");
    expect(await manager.connect(fixture.accountId)).toBe(true);
    expect(provider.connectCalls).toBe(1);
    expect(await redis.get(sessionLockKey(fixture.accountId))).toContain(config.WORKER_ID);
    expect(await statusOf(fixture.accountId)).toBe("CONNECTING");
  });

  it("declines when another worker already holds the lock", async () => {
    const { fixture, provider, manager } = await setup("contended");
    await redis.set(sessionLockKey(fixture.accountId), "other-worker:token", "PX", 30_000);

    expect(await manager.connect(fixture.accountId)).toBe(false);
    // No socket is opened, and the other worker's lock is left alone.
    expect(provider.connectCalls).toBe(0);
    expect(await redis.get(sessionLockKey(fixture.accountId))).toBe("other-worker:token");
  });

  // Regression: an unscanned QR expires, the provider closes its own socket
  // and reports ERROR. That close is deliberate, so it never reaches
  // onClosed — which means this is the only place the lock can be released.
  // Before the fix the lock stayed held with no socket behind it, and every
  // later connect returned "already connected" and did nothing, leaving the
  // account pinned at CONNECTING forever.
  it("releases the lock when the provider reports ERROR", async () => {
    const { fixture, provider, manager } = await setup("qr-expiry");
    await manager.connect(fixture.accountId);
    expect(await redis.get(sessionLockKey(fixture.accountId))).not.toBeNull();

    await provider.events!.onStatus("ERROR", { error: "The QR code expired before it was scanned" });

    expect(await redis.get(sessionLockKey(fixture.accountId))).toBeNull();
    expect(await statusOf(fixture.accountId)).toBe("ERROR");
  });

  it("can start a fresh socket after a QR expiry", async () => {
    const { fixture, provider, manager } = await setup("qr-retry");
    await manager.connect(fixture.accountId);
    await provider.events!.onStatus("ERROR", { error: "The QR code expired before it was scanned" });

    expect(await manager.connect(fixture.accountId)).toBe(true);
    expect(provider.connectCalls).toBe(2);
    expect(await statusOf(fixture.accountId)).toBe("CONNECTING");
  });

  it("clears lastError on the next successful transition", async () => {
    const { fixture, provider, manager } = await setup("clear-error");
    await manager.connect(fixture.accountId);
    await provider.events!.onStatus("ERROR", { error: "The QR code expired before it was scanned" });
    expect((await db.whatsAppAccount.findUniqueOrThrow({ where: { id: fixture.accountId } })).lastError).not.toBeNull();

    await manager.connect(fixture.accountId);
    expect((await db.whatsAppAccount.findUniqueOrThrow({ where: { id: fixture.accountId } })).lastError).toBeNull();
  });

  it("treats a repeated connect as a no-op while a socket is live", async () => {
    const { fixture, provider, manager } = await setup("double-connect");
    await manager.connect(fixture.accountId);
    await manager.connect(fixture.accountId);
    // A user clicking Connect twice must not churn the socket.
    expect(provider.connectCalls).toBe(1);
  });

  it("records the phone number and lastConnectedAt on connect", async () => {
    const { fixture, provider, manager } = await setup("connected");
    await manager.connect(fixture.accountId);
    await provider.events!.onConnected({ phoneNumber: "919800000001", displayName: "Test" });

    const account = await db.whatsAppAccount.findUniqueOrThrow({ where: { id: fixture.accountId } });
    expect(account.status).toBe("CONNECTED");
    expect(account.phoneNumber).toBe("919800000001");
    expect(account.lastConnectedAt).not.toBeNull();
  });

  it("disconnect logs out, wipes credentials and cancels queued messages", async () => {
    const { fixture, provider, manager } = await setup("disconnect");
    await manager.connect(fixture.accountId);

    const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
    await repo.set(fixture.accountId, "creds", "default", { v: 1 });
    const queued = await db.whatsAppMessage.create({
      data: { userId: fixture.userId, accountId: fixture.accountId, phoneNumber: "919800000002", body: "queued", status: "QUEUED" },
    });

    await manager.disconnect(fixture.accountId);

    expect(provider.disconnectCalls).toContainEqual({ accountId: fixture.accountId, logout: true });
    expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(0);
    expect((await db.whatsAppMessage.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("CANCELLED");
    expect(await redis.get(sessionLockKey(fixture.accountId))).toBeNull();
    expect(await statusOf(fixture.accountId)).toBe("DISCONNECTED");
  });

  it("a logout wipes credentials and asks for a relink", async () => {
    const { fixture, provider, manager } = await setup("logged-out");
    await manager.connect(fixture.accountId);
    const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
    await repo.set(fixture.accountId, "creds", "default", { v: 1 });

    await provider.events!.onLoggedOut("This device was unlinked in WhatsApp");

    expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(0);
    expect(await statusOf(fixture.accountId)).toBe("LOGGED_OUT");
    expect(await redis.get(sessionLockKey(fixture.accountId))).toBeNull();
  });

  // A transient close must not destroy credentials — the whole point is
  // that the account comes back without the user touching anything.
  it("a transient close keeps credentials and goes to RECONNECTING", async () => {
    const { fixture, provider, manager } = await setup("transient");
    await manager.connect(fixture.accountId);
    const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
    await repo.set(fixture.accountId, "creds", "default", { v: 1 });

    await provider.events!.onClosed({ action: "reconnect", reason: "Connection interrupted" });

    expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(1);
    expect(await statusOf(fixture.accountId)).toBe("RECONNECTING");
    // The lock is released so whichever worker picks up the reconnect job
    // can take ownership cleanly.
    expect(await redis.get(sessionLockKey(fixture.accountId))).toBeNull();
  });

  it("a fatal close goes to ERROR and keeps credentials", async () => {
    const { fixture, provider, manager } = await setup("fatal");
    await manager.connect(fixture.accountId);
    const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
    await repo.set(fixture.accountId, "creds", "default", { v: 1 });

    await provider.events!.onClosed({ action: "fatal", reason: "The connection was replaced by another session" });

    expect(await statusOf(fixture.accountId)).toBe("ERROR");
    expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(1);
  });

  describe("restoreAll", () => {
    // Asserted per account, not by call count: restoreAll deliberately
    // scans every user's accounts, so any other CONNECTED row in the shared
    // dev database would make a total count flaky.
    it("reconnects accounts that were CONNECTED", async () => {
      const { fixture, provider, manager } = await setup("restore");
      await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { status: "CONNECTED" } });

      await manager.restoreAll();

      expect(provider.connectedAccountIds).toContain(fixture.accountId);
    });

    it("ignores accounts the user disconnected", async () => {
      const { fixture, provider, manager } = await setup("restore-skip");
      await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { status: "DISCONNECTED" } });

      await manager.restoreAll();

      expect(provider.connectedAccountIds).not.toContain(fixture.accountId);
    });

    // A process that dies mid-connect leaves the account at CONNECTING.
    // With credentials stored it was a real session, so it must come back;
    // this is how the worker recovers from its own crash rather than
    // waiting for the user to notice and click Connect again.
    it("restores a CONNECTING account that has stored credentials", async () => {
      const { fixture, provider, manager } = await setup("restore-connecting");
      await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { status: "CONNECTING" } });
      const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
      await repo.set(fixture.accountId, "creds", "default", { v: 1 });

      await manager.restoreAll();

      expect(provider.connectedAccountIds).toContain(fixture.accountId);
    });

    // After a crash the worker's own stale lock can still be inside its
    // TTL, so restore declines. Giving up there would leave the account
    // unrestored until a user noticed; a scheduled reconnect covers it.
    it("schedules a reconnect when the lock is still held", async () => {
      const { fixture, provider, manager } = await setup("restore-locked");
      await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { status: "CONNECTED" } });
      await redis.set(sessionLockKey(fixture.accountId), "stale-worker:token", "PX", 30_000);

      await manager.restoreAll();

      expect(provider.connectedAccountIds).not.toContain(fixture.accountId);
      expect(scheduledReconnects).toContainEqual({ accountId: fixture.accountId, attempt: 1 });
    });

    // No credentials means the link attempt never got past the QR. Opening
    // a socket would only produce a code nobody is watching, so the row is
    // reset instead.
    it("clears an abandoned link attempt instead of restoring it", async () => {
      const { fixture, provider, manager } = await setup("restore-abandoned");
      await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { status: "CONNECTING" } });

      await manager.restoreAll();

      expect(provider.connectedAccountIds).not.toContain(fixture.accountId);
      expect(await statusOf(fixture.accountId)).toBe("DISCONNECTED");
    });
  });

  it("shutdown closes sockets and releases locks but keeps credentials", async () => {
    const { fixture, provider, manager } = await setup("shutdown");
    await manager.connect(fixture.accountId);
    const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
    await repo.set(fixture.accountId, "creds", "default", { v: 1 });

    await manager.shutdown();

    expect(provider.disconnectCalls).toContainEqual({ accountId: fixture.accountId, logout: false });
    expect(await redis.get(sessionLockKey(fixture.accountId))).toBeNull();
    // Credentials and the account status survive, which is what lets the
    // next boot restore the session without a QR scan.
    expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(1);
    expect(await statusOf(fixture.accountId)).toBe("CONNECTING");
  });
});
