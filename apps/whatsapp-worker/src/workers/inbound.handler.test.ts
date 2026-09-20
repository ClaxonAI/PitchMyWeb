import { afterAll, afterEach, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "../db.js";
import { createTestAccount, uniquePhone, type TestFixture } from "../testing/helpers.js";
import { InboundHandler, matchStopKeyword } from "./inbound.handler.js";

const db = getDb();
const handler = new InboundHandler(db);

const fixtures: TestFixture[] = [];
const phones: string[] = [];

async function fixture(label: string): Promise<TestFixture> {
  const created = await createTestAccount(label);
  fixtures.push(created);
  return created;
}

function phone(): string {
  const value = uniquePhone();
  phones.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(fixtures.map((f) => f.cleanup()));
  fixtures.length = 0;
  if (phones.length > 0) {
    await db.optOut.deleteMany({ where: { phoneNumber: { in: phones } } });
    phones.length = 0;
  }
});

afterAll(async () => {
  await disconnectDb();
});

// The matching rule is the safety property, so it is tested on its own. The
// cost asymmetry runs one way — a false positive loses one lead, a false
// negative means messaging someone who told us to stop — which is why short
// replies match generously and long prose does not match at all.
describe("matchStopKeyword", () => {
  it.each([["STOP"], ["stop"], ["Stop."], ["  STOP  "], ["UNSUBSCRIBE"], ["opt out"], ["Remove me"], ["do not contact"], ["No thanks"]])(
    "matches %s",
    (text) => {
      expect(matchStopKeyword(text)).not.toBeNull();
    },
  );

  it("matches a keyword inside a short reply", () => {
    expect(matchStopKeyword("please stop")).toBe("STOP");
    expect(matchStopKeyword("stop sending this")).toBe("STOP");
  });

  it("does not match a keyword inside a longer word", () => {
    expect(matchStopKeyword("stopwatch")).toBeNull();
    expect(matchStopKeyword("nonstopflight")).toBeNull();
  });

  it.each([["yes please"], ["sounds interesting"], ["how much?"], ["call me tomorrow"], [""], ["   "]])(
    "does not match an ordinary reply (%s)",
    (text) => {
      expect(matchStopKeyword(text)).toBeNull();
    },
  );

  // Long prose that merely mentions the word is a conversation, not a
  // refusal — matching it would silently drop a lead that was engaging.
  it("does not match a long message that merely mentions a keyword", () => {
    const prose =
      "Thanks for reaching out, we were about to stop working with our current agency so the timing is good, can you send more details";
    expect(matchStopKeyword(prose)).toBeNull();
  });

  it("reports which keyword matched", () => {
    expect(matchStopKeyword("UNSUBSCRIBE")).toBe("UNSUBSCRIBE");
  });
});

describe("InboundHandler.handleIncomingText", () => {
  it("records an opt-out for a stop reply", async () => {
    await fixture("optout");
    const phoneNumber = phone();
    await handler.handleIncomingText(phoneNumber, "STOP");
    const row = await db.optOut.findUnique({ where: { phoneNumber } });
    expect(row).toMatchObject({ source: "INBOUND_KEYWORD" });
    expect(row?.reason).toContain("STOP");
  });

  it("ignores an ordinary reply", async () => {
    await fixture("ordinary");
    const phoneNumber = phone();
    await handler.handleIncomingText(phoneNumber, "sure, tell me more");
    expect(await db.optOut.findUnique({ where: { phoneNumber } })).toBeNull();
  });

  it("is idempotent across repeated stop replies", async () => {
    await fixture("idempotent");
    const phoneNumber = phone();
    await handler.handleIncomingText(phoneNumber, "STOP");
    await handler.handleIncomingText(phoneNumber, "STOP");
    expect(await db.optOut.count({ where: { phoneNumber } })).toBe(1);
  });

  // How an opt-out was obtained is a fact about the past; a later inbound
  // keyword must not rewrite a manual entry.
  it("does not overwrite an existing manual opt-out", async () => {
    await fixture("manual");
    const phoneNumber = phone();
    await db.optOut.create({ data: { phoneNumber, source: "MANUAL", reason: "asked by phone" } });
    await handler.handleIncomingText(phoneNumber, "STOP");
    const row = await db.optOut.findUnique({ where: { phoneNumber } });
    expect(row).toMatchObject({ source: "MANUAL", reason: "asked by phone" });
  });

  it("ignores an implausible sender number", async () => {
    await handler.handleIncomingText("123", "STOP");
    expect(await db.optOut.findUnique({ where: { phoneNumber: "123" } })).toBeNull();
  });
});

describe("InboundHandler.handleReceipt", () => {
  async function seedSent(f: TestFixture, providerMessageId: string) {
    return db.whatsAppMessage.create({
      data: {
        userId: f.userId,
        accountId: f.accountId,
        phoneNumber: uniquePhone(),
        body: "hello",
        status: "SENT",
        providerMessageId,
        sentAt: new Date(),
      },
    });
  }

  it("moves SENT to DELIVERED", async () => {
    const f = await fixture("delivered");
    const message = await seedSent(f, `pmid-${Date.now()}-d`);
    await handler.handleReceipt(message.providerMessageId!, "DELIVERED");
    const updated = await db.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe("DELIVERED");
    expect(updated.deliveredAt).not.toBeNull();
  });

  it("moves SENT straight to READ and backfills deliveredAt", async () => {
    const f = await fixture("read");
    const message = await seedSent(f, `pmid-${Date.now()}-r`);
    await handler.handleReceipt(message.providerMessageId!, "READ");
    const updated = await db.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe("READ");
    expect(updated.deliveredAt).not.toBeNull();
  });

  // WhatsApp can deliver a late DELIVERED receipt after a READ one (a second
  // device acknowledging), which must not walk the row backwards.
  it("never moves READ back to DELIVERED", async () => {
    const f = await fixture("no-downgrade");
    const message = await seedSent(f, `pmid-${Date.now()}-n`);
    await handler.handleReceipt(message.providerMessageId!, "READ");
    await handler.handleReceipt(message.providerMessageId!, "DELIVERED");
    const updated = await db.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe("READ");
  });

  it("preserves the original deliveredAt when READ arrives later", async () => {
    const f = await fixture("preserve");
    const message = await seedSent(f, `pmid-${Date.now()}-p`);
    await handler.handleReceipt(message.providerMessageId!, "DELIVERED");
    const afterDelivery = await db.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
    await handler.handleReceipt(message.providerMessageId!, "READ");
    const afterRead = await db.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(afterRead.deliveredAt?.getTime()).toBe(afterDelivery.deliveredAt?.getTime());
  });

  it("ignores a receipt for an unknown message id", async () => {
    await expect(handler.handleReceipt("pmid-never-seen", "DELIVERED")).resolves.toBeUndefined();
  });

  it("does not resurrect a cancelled message", async () => {
    const f = await fixture("cancelled");
    const providerMessageId = `pmid-${Date.now()}-c`;
    const message = await db.whatsAppMessage.create({
      data: {
        userId: f.userId,
        accountId: f.accountId,
        phoneNumber: uniquePhone(),
        body: "hello",
        status: "CANCELLED",
        providerMessageId,
      },
    });
    await handler.handleReceipt(providerMessageId, "DELIVERED");
    const updated = await db.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe("CANCELLED");
  });
});
