import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Queue } from "bullmq";
import { createRedisConnection, sessionLockKey, whatsappPairingKey, type ReconnectJob, type WaStatus } from "@pitchmyweb/contracts";
import { getConfig } from "../config.js";
import { disconnectDb, getDb } from "../db.js";
import { createTestAccount, type TestFixture } from "../testing/helpers.js";
import { InboundHandler } from "../workers/inbound.handler.js";
import type { ConnectOptions, ProviderEvents, WhatsAppProvider } from "../providers/whatsapp.provider.js";
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
  /** Options passed to each connect, in order. */
  connectOptions: ConnectOptions[] = [];
  disconnectCalls: Array<{ accountId: string; logout: boolean }> = [];
  status: WaStatus = "DISCONNECTED";

  async connect(accountId: string, events: ProviderEvents, options: ConnectOptions = {}) {
    this.connectCalls += 1;
    this.connectedAccountIds.push(accountId);
    this.connectOptions.push(options);
    this.events = events;
    this.status = "CONNECTING";
    return { restored: false };
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
  await Promise.all(fixtures.map((f) => redis.del(sessionLockKey(f.accountId), whatsappPairingKey(f.accountId))));
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

  it("an automatic sign-out for the current login unlinks and wipes credentials", async () => {
    const { fixture, provider, manager } = await setup("auto-signout");
    const linkedAt = new Date("2026-09-20T10:00:00.000Z");
    await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { linkedAt } });
    await manager.connect(fixture.accountId);
    const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
    await repo.set(fixture.accountId, "creds", "default", { v: 1 });

    await manager.disconnect(fixture.accountId, { expectedLinkedAt: linkedAt.toISOString() });

    expect(provider.disconnectCalls).toContainEqual({ accountId: fixture.accountId, logout: true });
    expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(0);
    expect(await statusOf(fixture.accountId)).toBe("DISCONNECTED");
  });

  it("skips an automatic sign-out decided for an earlier login", async () => {
    const { fixture, provider, manager } = await setup("stale-signout");
    // The user linked again after the sign-out was queued.
    await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { linkedAt: new Date("2026-09-21T10:00:00.000Z") } });
    await manager.connect(fixture.accountId);
    const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
    await repo.set(fixture.accountId, "creds", "default", { v: 1 });

    await manager.disconnect(fixture.accountId, { expectedLinkedAt: "2026-09-20T10:00:00.000Z" });

    expect(provider.disconnectCalls).toHaveLength(0);
    expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(1);
    expect(await statusOf(fixture.accountId)).toBe("CONNECTING");
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

  describe("pairing code", () => {
    it("opens a fresh socket in pairing mode, from clean credentials", async () => {
      const { fixture, provider, manager } = await setup("pair-fresh");
      // Left over from an earlier failed attempt: exactly what made WhatsApp
      // treat the request as a login and log the account out.
      const repo = new PostgresAuthStateRepository(db, config.authEncryptionKey, 1);
      await repo.set(fixture.accountId, "creds", "creds", { me: { id: "919800000001@s.whatsapp.net" } });

      await manager.requestPairingCode(fixture.accountId, "919800000001");

      expect(provider.connectCalls).toBe(1);
      expect(provider.connectOptions[0]).toEqual({ pairingPhone: "919800000001" });
      expect(await db.whatsAppAuthKey.count({ where: { accountId: fixture.accountId } })).toBe(0);
      expect(await statusOf(fixture.accountId)).toBe("CONNECTING");
    });

    it("parks the code so the status poll can show it", async () => {
      const { fixture, provider, manager } = await setup("pair-park");
      await manager.requestPairingCode(fixture.accountId, "919800000001");
      await provider.events!.onPairingCode("ABCD1234");
      await provider.events!.onStatus("PAIRING_CODE_READY");

      const parked = JSON.parse((await redis.get(whatsappPairingKey(fixture.accountId)))!) as { code: string; expiresAt: string };
      expect(parked.code).toBe("ABCD1234");
      expect(new Date(parked.expiresAt).getTime()).toBeGreaterThan(Date.now() + 140_000);
      expect(await redis.ttl(whatsappPairingKey(fixture.accountId))).toBeGreaterThan(140);
      expect(await statusOf(fixture.accountId)).toBe("PAIRING_CODE_READY");
    });

    it("drops the parked code once the phone links, or the attempt fails", async () => {
      const linked = await setup("pair-clear-ok");
      await linked.manager.requestPairingCode(linked.fixture.accountId, "919800000001");
      await linked.provider.events!.onPairingCode("ABCD1234");
      await linked.provider.events!.onConnected({ phoneNumber: "919800000001", displayName: "Test" });
      expect(await redis.get(whatsappPairingKey(linked.fixture.accountId))).toBeNull();

      const failed = await setup("pair-clear-err");
      await failed.manager.requestPairingCode(failed.fixture.accountId, "919800000001");
      await failed.provider.events!.onPairingCode("ABCD1234");
      await failed.provider.events!.onStatus("ERROR", { error: "The code expired" });
      expect(await redis.get(whatsappPairingKey(failed.fixture.accountId))).toBeNull();
    });

    it("replaces an open QR attempt instead of asking on its socket", async () => {
      const { fixture, provider, manager } = await setup("pair-replace");
      await manager.connect(fixture.accountId);
      await manager.requestPairingCode(fixture.accountId, "919800000001");

      expect(provider.disconnectCalls).toEqual([{ accountId: fixture.accountId, logout: false }]);
      expect(provider.connectOptions).toEqual([{}, { pairingPhone: "919800000001" }]);
      expect(await redis.get(sessionLockKey(fixture.accountId))).toContain(config.WORKER_ID);
    });

    it("leaves a linked account alone", async () => {
      const { fixture, provider, manager } = await setup("pair-linked");
      await db.whatsAppAccount.update({ where: { id: fixture.accountId }, data: { status: "CONNECTED" } });
      await manager.requestPairingCode(fixture.accountId, "919800000001");
      expect(provider.connectCalls).toBe(0);
      expect(await statusOf(fixture.accountId)).toBe("CONNECTED");
    });

    it("says so when another worker holds the session, instead of hanging at CONNECTING", async () => {
      const { fixture, provider, manager } = await setup("pair-locked");
      await redis.set(sessionLockKey(fixture.accountId), "other-worker:token", "PX", 30_000);
      await manager.requestPairingCode(fixture.accountId, "919800000001");
      expect(provider.connectCalls).toBe(0);
      const account = await db.whatsAppAccount.findUniqueOrThrow({ where: { id: fixture.accountId } });
      expect(account.status).toBe("ERROR");
      expect(account.lastError).toMatch(/busy/);
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
