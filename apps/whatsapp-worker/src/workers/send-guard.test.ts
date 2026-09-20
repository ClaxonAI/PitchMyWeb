import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getConfig } from "../config.js";
import { disconnectDb, getDb } from "../db.js";
import { createTestAccount, uniquePhone, type TestFixture } from "../testing/helpers.js";
import { SendGuard } from "./send-guard.js";

// The authoritative gate. Every branch here is the last thing standing
// between a queued row and a message arriving on a real business's phone, so
// each one gets its own test against real data rather than a mocked query.

const db = getDb();
const config = getConfig();
const guard = new SendGuard(db, config);

const fixtures: TestFixture[] = [];

async function fixture(label: string, status: "CONNECTED" | "DISCONNECTED" = "CONNECTED"): Promise<TestFixture> {
  const created = await createTestAccount(label, status as "CONNECTED");
  fixtures.push(created);
  return created;
}

function baseInput(f: TestFixture, phoneNumber: string) {
  return {
    accountId: f.accountId,
    userId: f.userId,
    accountUserId: f.userId,
    accountStatus: "CONNECTED",
    socketConnected: true,
    phoneNumber,
  };
}

afterEach(async () => {
  await Promise.all(fixtures.map((f) => f.cleanup()));
  fixtures.length = 0;
});

afterAll(async () => {
  await disconnectDb();
});

describe("SendGuard", () => {
  it("allows a clean send", async () => {
    const f = await fixture("clean");
    expect(await guard.evaluate(baseInput(f, uniquePhone()))).toEqual({ allowed: true });
  });

  it("denies when the account belongs to a different user", async () => {
    const f = await fixture("cross-user");
    const decision = await guard.evaluate({ ...baseInput(f, uniquePhone()), accountUserId: "someone-else" });
    expect(decision).toMatchObject({ allowed: false, reason: "not_connected" });
  });

  it("denies when the stored account status is not CONNECTED", async () => {
    const f = await fixture("status");
    const decision = await guard.evaluate({ ...baseInput(f, uniquePhone()), accountStatus: "RECONNECTING" });
    expect(decision).toMatchObject({ allowed: false, reason: "not_connected" });
  });

  // The row can say CONNECTED while this process holds no socket — for
  // instance right after a restart, before restoreAll() finished.
  it("denies when this worker holds no live socket", async () => {
    const f = await fixture("no-socket");
    const decision = await guard.evaluate({ ...baseInput(f, uniquePhone()), socketConnected: false });
    expect(decision).toMatchObject({ allowed: false, reason: "not_connected" });
  });

  it.each([["12345"], ["1234567890123456"], ["+919800000001"], ["not-a-number"], [""]])(
    "denies an implausible number (%s)",
    async (phoneNumber) => {
      const f = await fixture("invalid");
      const decision = await guard.evaluate(baseInput(f, phoneNumber));
      expect(decision).toMatchObject({ allowed: false, reason: "invalid_number" });
    },
  );

  it("denies a number on the opt-out list", async () => {
    const f = await fixture("optout");
    const phoneNumber = uniquePhone();
    await db.optOut.create({ data: { phoneNumber, source: "INBOUND_KEYWORD", reason: 'Replied "STOP"' } });
    try {
      const decision = await guard.evaluate(baseInput(f, phoneNumber));
      expect(decision).toMatchObject({ allowed: false, reason: "opted_out" });
    } finally {
      await db.optOut.deleteMany({ where: { phoneNumber } });
    }
  });

  it("denies a number this account already messaged inside the window", async () => {
    const f = await fixture("duplicate");
    const phoneNumber = uniquePhone();
    await db.whatsAppMessage.create({
      data: { userId: f.userId, accountId: f.accountId, phoneNumber, body: "earlier", status: "SENT", sentAt: new Date() },
    });
    const decision = await guard.evaluate(baseInput(f, phoneNumber));
    expect(decision).toMatchObject({ allowed: false, reason: "recent_duplicate" });
  });

  it("allows again once the duplicate window has passed", async () => {
    const f = await fixture("duplicate-expired");
    const phoneNumber = uniquePhone();
    const longAgo = new Date(Date.now() - (config.WA_DUPLICATE_WINDOW_HOURS + 1) * 60 * 60 * 1000);
    await db.whatsAppMessage.create({
      data: { userId: f.userId, accountId: f.accountId, phoneNumber, body: "earlier", status: "SENT", sentAt: longAgo, createdAt: longAgo },
    });
    expect(await guard.evaluate(baseInput(f, phoneNumber))).toEqual({ allowed: true });
  });

  // A blocked attempt never reached the recipient, so it must not count as
  // having contacted them.
  it("does not treat a BLOCKED attempt as a duplicate", async () => {
    const f = await fixture("duplicate-blocked");
    const phoneNumber = uniquePhone();
    await db.whatsAppMessage.create({
      data: { userId: f.userId, accountId: f.accountId, phoneNumber, body: "blocked", status: "BLOCKED", failureReason: "opted_out" },
    });
    expect(await guard.evaluate(baseInput(f, phoneNumber))).toEqual({ allowed: true });
  });

  it("scopes the duplicate check to one account", async () => {
    const first = await fixture("dup-account-a");
    const second = await fixture("dup-account-b");
    const phoneNumber = uniquePhone();
    await db.whatsAppMessage.create({
      data: { userId: first.userId, accountId: first.accountId, phoneNumber, body: "earlier", status: "SENT", sentAt: new Date() },
    });
    expect(await guard.evaluate(baseInput(second, phoneNumber))).toEqual({ allowed: true });
  });

  describe("rate limits", () => {
    it("allows a first send", async () => {
      const f = await fixture("rate-clean");
      expect(await guard.checkRate(f.accountId)).toEqual({ allowed: true });
    });

    it("denies once the hourly cap is reached", async () => {
      const f = await fixture("rate-hour");
      const sentAt = new Date(Date.now() - 10 * 60 * 1000);
      await db.whatsAppMessage.createMany({
        data: Array.from({ length: config.WA_MAX_PER_HOUR }, () => ({
          userId: f.userId,
          accountId: f.accountId,
          phoneNumber: uniquePhone(),
          body: "sent",
          status: "SENT" as const,
          sentAt,
        })),
      });
      const result = await guard.checkRate(f.accountId);
      expect(result.allowed).toBe(false);
      // A rate denial carries a retry delay, because the send worker
      // re-delays the job rather than blocking the message.
      expect(result.allowed === false && result.retryAfterMs).toBeGreaterThan(0);
    });

    it("denies inside the minimum gap between sends", async () => {
      const f = await fixture("rate-gap");
      await db.whatsAppMessage.create({
        data: { userId: f.userId, accountId: f.accountId, phoneNumber: uniquePhone(), body: "sent", status: "SENT", sentAt: new Date() },
      });
      const result = await guard.checkRate(f.accountId);
      expect(result).toMatchObject({ allowed: false });
      expect(result.allowed === false && result.retryAfterMs).toBeLessThanOrEqual(config.WA_MIN_GAP_SECONDS * 1000);
    });

    it("allows once the gap has elapsed", async () => {
      const f = await fixture("rate-gap-passed");
      const sentAt = new Date(Date.now() - (config.WA_MIN_GAP_SECONDS + 5) * 1000);
      await db.whatsAppMessage.create({
        data: { userId: f.userId, accountId: f.accountId, phoneNumber: uniquePhone(), body: "sent", status: "SENT", sentAt },
      });
      expect(await guard.checkRate(f.accountId)).toEqual({ allowed: true });
    });

    it("ignores messages that were never sent", async () => {
      const f = await fixture("rate-unsent");
      await db.whatsAppMessage.createMany({
        data: Array.from({ length: config.WA_MAX_PER_HOUR + 5 }, () => ({
          userId: f.userId,
          accountId: f.accountId,
          phoneNumber: uniquePhone(),
          body: "queued",
          status: "QUEUED" as const,
        })),
      });
      expect(await guard.checkRate(f.accountId)).toEqual({ allowed: true });
    });

    it("scopes counting to one account", async () => {
      const busy = await fixture("rate-busy");
      const quiet = await fixture("rate-quiet");
      const sentAt = new Date(Date.now() - 10 * 60 * 1000);
      await db.whatsAppMessage.createMany({
        data: Array.from({ length: config.WA_MAX_PER_HOUR }, () => ({
          userId: busy.userId,
          accountId: busy.accountId,
          phoneNumber: uniquePhone(),
          body: "sent",
          status: "SENT" as const,
          sentAt,
        })),
      });
      expect(await guard.checkRate(quiet.accountId)).toEqual({ allowed: true });
    });
  });
});
