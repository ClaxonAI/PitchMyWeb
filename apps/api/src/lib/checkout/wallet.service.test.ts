import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { InsufficientPitchCreditsError } from "../errors";
import { FREE_PITCH_ALLOWANCE } from "./paid-access";
import { ensureFreeGrant, getOrCreateWallet, grantCredits, releasePitchCredits, reservePitchCredits } from "./wallet.service";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

async function newUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  return user;
}

describe("getOrCreateWallet", () => {
  it("creates an all-zero wallet on first touch", async () => {
    const user = await newUser("wallet-create");
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 0, reservedCredits: 0, usedCredits: 0 });
  });

  it("returns the same wallet on a second call rather than resetting it", async () => {
    const user = await newUser("wallet-idempotent-create");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet.availableCredits).toBe(20);
  });
});

describe("grantCredits", () => {
  it("adds to availableCredits and records a ledger entry", async () => {
    const user = await newUser("grant-basic");
    const wallet = await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", orderId: "order-1", referenceId: "purchase:order-1" });
    expect(wallet.availableCredits).toBe(20);

    const ledger = await prisma.pitchCreditLedger.findMany({ where: { userId: user.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "PURCHASE", amount: 20, orderId: "order-1", referenceId: "purchase:order-1" });
  });

  it("is idempotent per referenceId — a duplicate grant (e.g. a claimed order re-processed) never double-credits", async () => {
    const user = await newUser("grant-idempotent");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", orderId: "order-2", referenceId: "purchase:order-2" });
    const second = await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", orderId: "order-2", referenceId: "purchase:order-2" });

    expect(second.availableCredits).toBe(20);
    const ledger = await prisma.pitchCreditLedger.count({ where: { userId: user.id, referenceId: "purchase:order-2" } });
    expect(ledger).toBe(1);
  });

  it("accumulates across separate purchases with distinct referenceIds", async () => {
    const user = await newUser("grant-accumulate");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", orderId: "order-3a", referenceId: "purchase:order-3a" });
    const wallet = await grantCredits(prisma, { userId: user.id, amount: 50, type: "PURCHASE", orderId: "order-3b", referenceId: "purchase:order-3b" });
    expect(wallet.availableCredits).toBe(70);
  });
});

describe("ensureFreeGrant", () => {
  it("grants the free allowance exactly once, however many times it is called", async () => {
    const user = await newUser("free-grant-once");
    await ensureFreeGrant(prisma, user.id);
    await ensureFreeGrant(prisma, user.id);
    const wallet = await ensureFreeGrant(prisma, user.id);

    expect(wallet.availableCredits).toBe(FREE_PITCH_ALLOWANCE);
    const grants = await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "FREE_GRANT" } });
    expect(grants).toBe(1);
  });
});

describe("reservePitchCredits", () => {
  it("moves available -> reserved atomically and records a RESERVE ledger entry", async () => {
    const user = await newUser("reserve-basic");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    await prisma.$transaction((tx) => reservePitchCredits(tx, user.id, 15, `reserve:${user.id}`));

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 5, reservedCredits: 15 });
    const ledger = await prisma.pitchCreditLedger.findFirst({ where: { userId: user.id, type: "RESERVE" } });
    expect(ledger?.amount).toBe(15);
  });

  it("throws InsufficientPitchCreditsError with the real balance, and reserves nothing, when the request exceeds it", async () => {
    const user = await newUser("reserve-insufficient");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    await expect(prisma.$transaction((tx) => reservePitchCredits(tx, user.id, 21, `reserve:${user.id}`))).rejects.toMatchObject({
      details: { available: 20, requested: 21 },
    });
    await expect(prisma.$transaction((tx) => reservePitchCredits(tx, user.id, 21, `reserve:${user.id}`))).rejects.toBeInstanceOf(InsufficientPitchCreditsError);

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 20, reservedCredits: 0 });
  });

  it("never lets two concurrent reservations collectively exceed the balance", async () => {
    // 20 available; two concurrent requests for 15 and 10 (25 total) must
    // never both succeed — Postgres's row lock under the transaction is what
    // makes this safe, not application-level coordination.
    const user = await newUser("reserve-concurrent");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    const results = await Promise.allSettled([
      prisma.$transaction((tx) => reservePitchCredits(tx, user.id, 15, `reserve:${user.id}:a`)),
      prisma.$transaction((tx) => reservePitchCredits(tx, user.id, 10, `reserve:${user.id}:b`)),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);

    const wallet = await getOrCreateWallet(prisma, user.id);
    // Whichever one won, reserved is exactly its amount — never 25, never both.
    expect([10, 15]).toContain(wallet.reservedCredits);
    expect(wallet.availableCredits + wallet.reservedCredits).toBe(20);
  });
});

describe("releasePitchCredits", () => {
  it("moves reserved -> available and records a RELEASE ledger entry", async () => {
    const user = await newUser("release-basic");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });
    await prisma.$transaction((tx) => reservePitchCredits(tx, user.id, 15, `reserve:${user.id}`));

    // Only 11 of the 15 reserved turned out to be eligible leads; release the shortfall.
    await prisma.$transaction((tx) => releasePitchCredits(tx, user.id, 4, `release:${user.id}`));

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 9, reservedCredits: 11 });
    const ledger = await prisma.pitchCreditLedger.findFirst({ where: { userId: user.id, type: "RELEASE" } });
    expect(ledger?.amount).toBe(4);
  });

  it("is a no-op for a zero amount", async () => {
    const user = await newUser("release-zero");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });
    await prisma.$transaction((tx) => reservePitchCredits(tx, user.id, 15, `reserve:${user.id}`));

    await prisma.$transaction((tx) => releasePitchCredits(tx, user.id, 0, `release:${user.id}`));

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 5, reservedCredits: 15 });
    const ledger = await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "RELEASE" } });
    expect(ledger).toBe(0);
  });
});
