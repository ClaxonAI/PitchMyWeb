import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { backfillLegacyPitchCredits } from "./legacy-credit-backfill";
import { claimPaidOrdersForUser } from "./checkout.service";
import { getOrCreateWallet } from "./wallet.service";

// Migrating accounts that paid before credits existed. The thing worth
// proving is not the arithmetic but that nobody can be paid twice: this
// script, claimOrder, and a second run of this script all write through the
// same ledger referenceId, so whichever order they happen to run in, the
// customer ends up with exactly one pack per purchase.

// Every call below is scoped to the accounts the test just made. The
// backfill sweeps the whole database by design, and these tests share a
// development database with every other suite — an unscoped run would hand
// credits to users other tests are in the middle of asserting about.
const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

let orderSeq = 0;
async function legacyPaidOrder(userId: string | null, email: string, overrides: { planId?: string; market?: string } = {}) {
  orderSeq += 1;
  return prisma.order.create({
    data: {
      userId,
      payerEmail: email,
      planId: overrides.planId ?? "auto",
      market: overrides.market ?? "india",
      amount: 14900,
      currency: "INR",
      status: "PAID",
      // credits stays at its 0 default: that is what "placed before the
      // credit system existed" looks like in the database.
      razorpayOrderId: `legacy_backfill_${Date.now()}_${orderSeq}`,
      razorpayPaymentId: `pay_legacy_${Date.now()}_${orderSeq}`,
      razorpaySignature: "test",
    },
  });
}

async function newUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  return user;
}

describe("backfillLegacyPitchCredits", () => {
  it("fills in an old paid order's pack size and grants it", async () => {
    const user = await newUser("legacy-order");
    const order = await legacyPaidOrder(user.id, user.email);

    const result = await backfillLegacyPitchCredits(prisma, { only: { userIds: [user.id] } });

    expect(result.ordersFilled).toBe(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { credits: true } })).toEqual({ credits: 20 });
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject({ availableCredits: 20, reservedCredits: 0, usedCredits: 0 });
    const ledger = await prisma.pitchCreditLedger.findMany({ where: { userId: user.id, type: "PURCHASE" } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ amount: 20, orderId: order.id, referenceId: `purchase:${order.id}` });
  });

  it("is safe to run twice — nobody gets a second pack", async () => {
    const user = await newUser("legacy-twice");
    await legacyPaidOrder(user.id, user.email);

    await backfillLegacyPitchCredits(prisma, { only: { userIds: [user.id] } });
    await backfillLegacyPitchCredits(prisma, { only: { userIds: [user.id] } });

    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject({ availableCredits: 20 });
    expect(await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "PURCHASE" } })).toBe(1);
  });

  it("does not pay out twice when the normal claim path runs after it", async () => {
    // The order was placed anonymously and backfilled before its buyer ever
    // signed in; claimPaidOrdersForUser then finds it by (verified) email and
    // claims it the ordinary way. Both write `purchase:<orderId>`, so the second one
    // is a no-op rather than a second grant.
    const user = await newUser("legacy-then-claim");
    const order = await legacyPaidOrder(null, user.email);

    await backfillLegacyPitchCredits(prisma, { only: { payerEmails: [user.email] } });
    await claimPaidOrdersForUser(prisma, user.id, user.email, { emailVerified: true });

    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { userId: true, credits: true } })).toEqual({
      userId: user.id,
      credits: 20,
    });
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject({ availableCredits: 20 });
    expect(await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "PURCHASE" } })).toBe(1);
  });

  it("never hands an order to an account whose email was not verified", async () => {
    // Someone registers with the buyer's email address (email-and-password
    // sign-up checks nothing): the buyer's order must stay unclaimed.
    const user = await newUser("legacy-unverified");
    const order = await legacyPaidOrder(null, user.email);
    await claimPaidOrdersForUser(prisma, user.id, user.email, { emailVerified: false });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { userId: true } })).userId).toBeNull();
  });

  it("grants an admin-assigned plan its pack, once", async () => {
    const user = await newUser("legacy-plan");
    await prisma.user.update({ where: { id: user.id }, data: { planId: "direct" } });

    await backfillLegacyPitchCredits(prisma, { only: { userIds: [user.id] } });
    await backfillLegacyPitchCredits(prisma, { only: { userIds: [user.id] } });

    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject({ availableCredits: 50 });
    const ledger = await prisma.pitchCreditLedger.findMany({ where: { userId: user.id, type: "PURCHASE" } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ amount: 50, referenceId: `legacy-plan:${user.id}` });
  });

  it("refuses to guess at a plan it does not know, and says so", async () => {
    const user = await newUser("legacy-unknown-plan");
    await prisma.user.update({ where: { id: user.id }, data: { planId: "some-retired-plan" } });

    const result = await backfillLegacyPitchCredits(prisma, { only: { userIds: [user.id] } });

    expect(result.skipped).toContainEqual({ kind: "user", id: user.id, reason: "unknown plan (some-retired-plan)" });
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject({ availableCredits: 0 });
  });

  it("writes nothing in a dry run", async () => {
    const user = await newUser("legacy-dry-run");
    const order = await legacyPaidOrder(user.id, user.email);

    const result = await backfillLegacyPitchCredits(prisma, { dryRun: true, only: { userIds: [user.id] } });

    expect(result.ordersFilled).toBe(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { credits: true } })).toEqual({ credits: 0 });
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject({ availableCredits: 0 });
  });
});
