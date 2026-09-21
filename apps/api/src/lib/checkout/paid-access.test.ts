import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { PaymentRequiredError, ValidationError } from "../errors";
import {
  FREE_PITCH_ALLOWANCE,
  assertFreePitchBudget,
  assertMarketAllowed,
  assertPaidDiscoveryAllowed,
  getAllowedMarkets,
  getFreePitchesRemaining,
  isPaidDiscoveryRequired,
  userCanDiscover,
} from "./paid-access";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

describe("isPaidDiscoveryRequired", () => {
  it("is off under Vitest unless REQUIRE_PAID_FOR_DISCOVERY_IN_TESTS is set", () => {
    expect(isPaidDiscoveryRequired({ VITEST: "true", REQUIRE_PAID_FOR_DISCOVERY: "true" })).toBe(false);
    expect(isPaidDiscoveryRequired({ VITEST: "true", REQUIRE_PAID_FOR_DISCOVERY_IN_TESTS: "true" })).toBe(true);
  });

  it("is on in development by default", () => {
    expect(isPaidDiscoveryRequired({ NODE_ENV: "development" })).toBe(true);
    expect(isPaidDiscoveryRequired({ NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "false" })).toBe(false);
  });
});

describe("free pitch allowance", () => {
  const gated = { NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "true", VITEST: "false" };

  it("gives every fresh account the full free allowance, granted lazily as real wallet credits", async () => {
    const user = await createTestUser("free-pitch-fresh");
    createdUserIds.push(user.id);
    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBe(FREE_PITCH_ALLOWANCE);
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(true);
    await expect(assertPaidDiscoveryAllowed(prisma, user.id, gated)).resolves.toBeUndefined();
    await expect(assertFreePitchBudget(prisma, user.id, FREE_PITCH_ALLOWANCE, gated)).resolves.toBeUndefined();

    // The grant is a real, stored PitchWallet row now, not a recomputed number.
    const wallet = await prisma.pitchWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableCredits).toBe(FREE_PITCH_ALLOWANCE);
  });

  it("grants the free allowance exactly once, however many times it is touched", async () => {
    const user = await createTestUser("free-pitch-idempotent");
    createdUserIds.push(user.id);
    await getFreePitchesRemaining(prisma, user.id, gated);
    await getFreePitchesRemaining(prisma, user.id, gated);
    await getFreePitchesRemaining(prisma, user.id, gated);

    const wallet = await prisma.pitchWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableCredits).toBe(FREE_PITCH_ALLOWANCE);
    const grants = await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "FREE_GRANT" } });
    expect(grants).toBe(1);
  });

  it("rejects requests larger than remaining free pitches", async () => {
    const user = await createTestUser("free-pitch-over");
    createdUserIds.push(user.id);
    await expect(assertFreePitchBudget(prisma, user.id, FREE_PITCH_ALLOWANCE + 1, gated)).rejects.toThrow(ValidationError);
  });

  it("blocks discovery once the wallet is empty", async () => {
    const user = await createTestUser("free-pitch-spent");
    createdUserIds.push(user.id);
    // Selection-time reservation (Phase 2) is what actually spends credits in
    // production; this test only needs an empty wallet, so it sets one up
    // directly rather than driving a full campaign through discovery+selection.
    await prisma.pitchWallet.upsert({ where: { userId: user.id }, create: { userId: user.id, availableCredits: 0 }, update: { availableCredits: 0 } });
    await prisma.pitchCreditLedger.create({ data: { userId: user.id, type: "FREE_GRANT", amount: FREE_PITCH_ALLOWANCE, referenceId: `free-grant:${user.id}` } });

    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBe(0);
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(false);
    await expect(assertPaidDiscoveryAllowed(prisma, user.id, gated)).rejects.toThrow(PaymentRequiredError);
  });

  it("treats planId as paid access with no free-budget cap (transitional — see paid-access.ts header comment)", async () => {
    const user = await createTestUser("free-pitch-paid");
    createdUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { planId: "auto" } });
    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBeNull();
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(true);
    await expect(assertFreePitchBudget(prisma, user.id, 50, gated)).resolves.toBeUndefined();
  });
});

describe("market entitlements", () => {
  const gated = { NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "true", VITEST: "false" };

  async function createPaidOrder(userId: string, market: "india" | "foreign") {
    return prisma.order.create({
      data: {
        userId,
        planId: "auto",
        market,
        amount: market === "india" ? 14900 : 280,
        currency: market === "india" ? "INR" : "USD",
        status: "PAID",
        razorpayOrderId: `test_${userId}_${market}`,
        razorpayPaymentId: `pay_${userId}_${market}`,
        razorpaySignature: "test",
      },
    });
  }

  it("allows only the market purchased", async () => {
    const indiaUser = await createTestUser("market-india");
    const foreignUser = await createTestUser("market-foreign");
    createdUserIds.push(indiaUser.id, foreignUser.id);
    await createPaidOrder(indiaUser.id, "india");
    await createPaidOrder(foreignUser.id, "foreign");

    expect(await getAllowedMarkets(prisma, indiaUser.id, gated)).toEqual(["india"]);
    expect(await getAllowedMarkets(prisma, foreignUser.id, gated)).toEqual(["foreign"]);
    await expect(assertMarketAllowed(prisma, indiaUser.id, "foreign", gated)).rejects.toThrow(ValidationError);
    await expect(assertMarketAllowed(prisma, foreignUser.id, "india", gated)).rejects.toThrow(ValidationError);
  });

  it("unlocks both markets after both market purchases", async () => {
    const user = await createTestUser("market-both");
    createdUserIds.push(user.id);
    await createPaidOrder(user.id, "india");
    await createPaidOrder(user.id, "foreign");

    expect((await getAllowedMarkets(prisma, user.id, gated)).sort()).toEqual(["foreign", "india"]);
    await expect(assertMarketAllowed(prisma, user.id, "india", gated)).resolves.toBeUndefined();
    await expect(assertMarketAllowed(prisma, user.id, "foreign", gated)).resolves.toBeUndefined();
  });
});