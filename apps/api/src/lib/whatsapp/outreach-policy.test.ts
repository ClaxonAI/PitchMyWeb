import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { evaluate } from "./outreach-policy";

// The API half of the gate. It is the pre-check the user sees inline; the
// worker re-runs a superset of it immediately before sending, so a denial
// here means "do not even queue this", not "this is the final word".

const createdUserIds: string[] = [];
const createdPhones: string[] = [];

let seq = 0;
function phone(): string {
  seq += 1;
  const value = `9188${String(Date.now()).slice(-7)}${String(seq).padStart(2, "0")}`;
  createdPhones.push(value);
  return value;
}

async function userWithAccount(prefix: string, status: "CONNECTED" | "DISCONNECTED" | "RECONNECTING" = "CONNECTED") {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const account = await prisma.whatsAppAccount.create({ data: { userId: user.id, status } });
  return { userId: user.id, accountId: account.id };
}

afterEach(async () => {
  if (createdPhones.length > 0) {
    await prisma.optOut.deleteMany({ where: { phoneNumber: { in: createdPhones } } });
    createdPhones.length = 0;
  }
});

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

describe("outreach policy", () => {
  it("allows a connected account messaging a fresh number", async () => {
    const { userId, accountId } = await userWithAccount("policy-allow");
    expect(await evaluate(prisma, { userId, accountId, phoneNumber: phone() })).toEqual({ allowed: true });
  });

  it.each([["123"], ["1234567890123456"], ["+919800000001"], ["98 0000 0001"], [""]])(
    "denies an implausible number (%s)",
    async (phoneNumber) => {
      const { userId, accountId } = await userWithAccount("policy-invalid");
      expect(await evaluate(prisma, { userId, accountId, phoneNumber })).toMatchObject({
        allowed: false,
        reason: "invalid_number",
      });
    },
  );

  it.each([["DISCONNECTED"], ["RECONNECTING"]] as const)("denies when the account is %s", async (status) => {
    const { userId, accountId } = await userWithAccount("policy-status", status);
    expect(await evaluate(prisma, { userId, accountId, phoneNumber: phone() })).toMatchObject({
      allowed: false,
      reason: "not_connected",
    });
  });

  // Another user's account id must behave exactly like one that does not
  // exist — no signal that it is real.
  it("denies another user's account id", async () => {
    const owner = await userWithAccount("policy-owner");
    const other = await userWithAccount("policy-other");
    expect(await evaluate(prisma, { userId: other.userId, accountId: owner.accountId, phoneNumber: phone() })).toMatchObject({
      allowed: false,
      reason: "not_connected",
    });
  });

  it("denies an unknown account id", async () => {
    const { userId } = await userWithAccount("policy-unknown");
    expect(await evaluate(prisma, { userId, accountId: "does-not-exist", phoneNumber: phone() })).toMatchObject({
      allowed: false,
      reason: "not_connected",
    });
  });

  it("denies a number on the opt-out list", async () => {
    const { userId, accountId } = await userWithAccount("policy-optout");
    const phoneNumber = phone();
    await prisma.optOut.create({ data: { phoneNumber, source: "MANUAL" } });
    expect(await evaluate(prisma, { userId, accountId, phoneNumber })).toMatchObject({
      allowed: false,
      reason: "opted_out",
    });
  });

  // The list is global by design: once a business says stop, no PitchMyWeb
  // user may message it, not merely the one who heard it.
  it("applies the opt-out list across users", async () => {
    const first = await userWithAccount("policy-optout-a");
    const second = await userWithAccount("policy-optout-b");
    const phoneNumber = phone();
    await prisma.optOut.create({ data: { phoneNumber, source: "INBOUND_KEYWORD" } });
    expect(await evaluate(prisma, { ...first, phoneNumber })).toMatchObject({ allowed: false, reason: "opted_out" });
    expect(await evaluate(prisma, { ...second, phoneNumber })).toMatchObject({ allowed: false, reason: "opted_out" });
  });

  it("denies a number this account messaged recently", async () => {
    const { userId, accountId } = await userWithAccount("policy-dup");
    const phoneNumber = phone();
    await prisma.whatsAppMessage.create({
      data: { userId, accountId, phoneNumber, body: "earlier", status: "SENT", sentAt: new Date() },
    });
    expect(await evaluate(prisma, { userId, accountId, phoneNumber })).toMatchObject({
      allowed: false,
      reason: "recent_duplicate",
    });
  });

  it("allows again once the duplicate window has passed", async () => {
    const { userId, accountId } = await userWithAccount("policy-dup-expired");
    const phoneNumber = phone();
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.whatsAppMessage.create({
      data: { userId, accountId, phoneNumber, body: "earlier", status: "SENT", sentAt: longAgo, createdAt: longAgo },
    });
    expect(await evaluate(prisma, { userId, accountId, phoneNumber })).toEqual({ allowed: true });
  });

  it("does not count a blocked attempt as contact", async () => {
    const { userId, accountId } = await userWithAccount("policy-dup-blocked");
    const phoneNumber = phone();
    await prisma.whatsAppMessage.create({
      data: { userId, accountId, phoneNumber, body: "blocked", status: "BLOCKED", failureReason: "rate_limited" },
    });
    expect(await evaluate(prisma, { userId, accountId, phoneNumber })).toEqual({ allowed: true });
  });

  it("returns a user-facing message with every denial", async () => {
    const { userId, accountId } = await userWithAccount("policy-message");
    const decision = await evaluate(prisma, { userId, accountId, phoneNumber: "123" });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.message.length).toBeGreaterThan(0);
  });
});
