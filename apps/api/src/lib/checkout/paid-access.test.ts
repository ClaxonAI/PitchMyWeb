import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { PaymentRequiredError, ValidationError } from "../errors";
import {
  FREE_PITCH_ALLOWANCE,
  assertCanStartDiscovery,
  assertMarketAllowed,
  getAllowedMarkets,
  getSpendableCredits,
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

describe("credit gate on discovery", () => {
  const gated = { NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "true", VITEST: "false" };

  /**
   * Empties a wallet without driving a whole campaign through discovery and
   * selection (which is what really spends credits in production — see
   * selection.service.ts). These tests only need the balance, not the story
   * that produced it.
   */
  async function setWallet(userId: string, balances: { availableCredits?: number; reservedCredits?: number }) {
    const data = { availableCredits: 0, reservedCredits: 0, ...balances };
    await prisma.pitchWallet.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    await prisma.pitchCreditLedger.upsert({
      where: { referenceId: `free-grant:${userId}` },
      create: { userId, type: "FREE_GRANT", amount: FREE_PITCH_ALLOWANCE, referenceId: `free-grant:${userId}` },
      update: {},
    });
  }

  it("gives every fresh account the full free allowance, granted lazily as real wallet credits", async () => {
    const user = await createTestUser("credit-gate-fresh");
    createdUserIds.push(user.id);
    expect(await getSpendableCredits(prisma, user.id, gated)).toBe(FREE_PITCH_ALLOWANCE);
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(true);
    await expect(assertCanStartDiscovery(prisma, user.id, gated)).resolves.toBeUndefined();

    // The grant is a real, stored PitchWallet row now, not a recomputed number.
    const wallet = await prisma.pitchWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableCredits).toBe(FREE_PITCH_ALLOWANCE);
  });

  it("grants the free allowance exactly once, however many times it is touched", async () => {
    const user = await createTestUser("credit-gate-idempotent");
    createdUserIds.push(user.id);
    await getSpendableCredits(prisma, user.id, gated);
    await getSpendableCredits(prisma, user.id, gated);
    await getSpendableCredits(prisma, user.id, gated);

    const wallet = await prisma.pitchWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableCredits).toBe(FREE_PITCH_ALLOWANCE);
    const grants = await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "FREE_GRANT" } });
    expect(grants).toBe(1);
  });

  it("does not care how many leads are being asked for", async () => {
    // The old gate compared targetCount against the remaining allowance and
    // rejected anything larger, which charged for leads that did not exist
    // yet. Finding leads is free; pitching them is what costs, and that is
    // reserved at selection time.
    const user = await createTestUser("credit-gate-large-request");
    createdUserIds.push(user.id);
    await setWallet(user.id, { availableCredits: 1 });
    await expect(assertCanStartDiscovery(prisma, user.id, gated)).resolves.toBeUndefined();
  });

  it("blocks discovery once the wallet is empty", async () => {
    const user = await createTestUser("credit-gate-spent");
    createdUserIds.push(user.id);
    await setWallet(user.id, {});

    expect(await getSpendableCredits(prisma, user.id, gated)).toBe(0);
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(false);
    await expect(assertCanStartDiscovery(prisma, user.id, gated)).rejects.toThrow(PaymentRequiredError);
    await expect(assertCanStartDiscovery(prisma, user.id, gated)).rejects.toThrow(/free pitches/);
  });

  it("blocks a paid user whose credits are spent, with wording that fits (no unlimited plans any more)", async () => {
    const user = await createTestUser("credit-gate-paid-spent");
    createdUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { planId: "auto" } });
    await setWallet(user.id, {});

    expect(await userCanDiscover(prisma, user.id, gated)).toBe(false);
    await expect(assertCanStartDiscovery(prisma, user.id, gated)).rejects.toThrow(PaymentRequiredError);
    await expect(assertCanStartDiscovery(prisma, user.id, gated)).rejects.toThrow(/credit pack/);
  });

  it("counts reserved credits as spending power — they are in flight, not lost", async () => {
    // Everything available has been reserved by a batch that is still
    // working. Those pitches will either send or refund, so the account is
    // not out of credits and should not be treated as if it were.
    const user = await createTestUser("credit-gate-reserved");
    createdUserIds.push(user.id);
    await setWallet(user.id, { reservedCredits: 3 });

    expect(await getSpendableCredits(prisma, user.id, gated)).toBe(3);
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(true);
    await expect(assertCanStartDiscovery(prisma, user.id, gated)).resolves.toBeUndefined();
  });

  it("applies no gate at all where paid discovery is not required", async () => {
    const user = await createTestUser("credit-gate-ungated");
    createdUserIds.push(user.id);
    await setWallet(user.id, {});
    const ungated = { NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "false", VITEST: "false" };

    // Null means "no limit applies", which is deliberately not the same
    // answer as zero.
    expect(await getSpendableCredits(prisma, user.id, ungated)).toBeNull();
    expect(await userCanDiscover(prisma, user.id, ungated)).toBe(true);
    await expect(assertCanStartDiscovery(prisma, user.id, ungated)).resolves.toBeUndefined();
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