import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { InsufficientPitchCreditsError } from "../errors";
import { FREE_PITCH_ALLOWANCE } from "./paid-access";
import { consumeReservedCredit, ensureFreeGrant, getOrCreateWallet, grantCredits, reconcileCreditLedger, refundReservedCredit, releasePitchCredits, reservePitchCredits } from "./wallet.service";

// These tests exercise the reserve/release primitives on their own, so
// there is no real PitchBatch behind them. The ledger's batchId carries no
// foreign key (a credit movement outlives the batch it refers to), so a
// stand-in id is honest here: what is under test is the wallet arithmetic,
// not the batch.
const TEST_BATCH_ID = "wallet-service-test-batch";

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

    await prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 15, referenceId: `reserve:${user.id}` }));

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 5, reservedCredits: 15 });
    const ledger = await prisma.pitchCreditLedger.findFirst({ where: { userId: user.id, type: "RESERVE" } });
    expect(ledger?.amount).toBe(15);
  });

  it("throws InsufficientPitchCreditsError with the real balance, and reserves nothing, when the request exceeds it", async () => {
    const user = await newUser("reserve-insufficient");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    await expect(prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 21, referenceId: `reserve:${user.id}` }))).rejects.toMatchObject({
      details: { available: 20, requested: 21 },
    });
    await expect(prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 21, referenceId: `reserve:${user.id}` }))).rejects.toBeInstanceOf(InsufficientPitchCreditsError);

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
      prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 15, referenceId: `reserve:${user.id}:a` })),
      prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 10, referenceId: `reserve:${user.id}:b` })),
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
    await prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 15, referenceId: `reserve:${user.id}` }));

    // Only 11 of the 15 reserved turned out to be eligible leads; release the shortfall.
    await prisma.$transaction((tx) => releasePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 4, referenceId: `release:${user.id}` }));

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 9, reservedCredits: 11 });
    const ledger = await prisma.pitchCreditLedger.findFirst({ where: { userId: user.id, type: "RELEASE" } });
    expect(ledger?.amount).toBe(4);
  });

  it("is a no-op for a zero amount", async () => {
    const user = await newUser("release-zero");
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });
    await prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 15, referenceId: `reserve:${user.id}` }));

    await prisma.$transaction((tx) => releasePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 0, referenceId: `release:${user.id}` }));

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 5, reservedCredits: 15 });
    const ledger = await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "RELEASE" } });
    expect(ledger).toBe(0);
  });
});
describe("the books balance", () => {
  /**
   * The system's one non-negotiable identity, checked against a wallet that
   * has been through every kind of movement there is:
   *
   *   available + reserved + used = everything ever granted
   *
   * Each primitive is tested on its own above; this asserts they compose —
   * that no sequence of reserve/release/consume/refund can create or destroy
   * a credit — and that the wallet agrees with the ledger, which is the only
   * record a customer disputing their balance could be shown.
   */
  it("wallet and ledger agree after a full round of movements", async () => {
    const user = await newUser("invariant");
    await ensureFreeGrant(prisma, user.id);
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    // A batch of 8 reserved, 3 of which turned out ineligible and were
    // released; of the 5 that went out, 2 sent and 1 failed for good.
    await prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 8, referenceId: `reserve:${user.id}` }));
    await prisma.$transaction((tx) => releasePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 3, referenceId: `release:${user.id}` }));
    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `${user.id}-p1` }));
    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `${user.id}-p2` }));
    await prisma.$transaction((tx) => refundReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `${user.id}-p3` }));

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toEqual({ availableCredits: FREE_PITCH_ALLOWANCE + 20 - 8 + 3 + 1, reservedCredits: 8 - 3 - 2 - 1, usedCredits: 2 });

    const ledger = await prisma.pitchCreditLedger.findMany({ where: { userId: user.id }, select: { type: true, amount: true } });
    const total = (type: string) => ledger.filter((entry) => entry.type === type).reduce((sum, entry) => sum + entry.amount, 0);
    const granted = total("PURCHASE") + total("FREE_GRANT");

    expect(granted).toBe(FREE_PITCH_ALLOWANCE + 20);
    expect(wallet.availableCredits + wallet.reservedCredits + wallet.usedCredits).toBe(granted);
    // And each column is exactly what the ledger says it should be, so the
    // identity above cannot be satisfied by two compensating errors.
    expect(wallet.availableCredits).toBe(granted - total("RESERVE") + total("RELEASE") + total("REFUND"));
    expect(wallet.reservedCredits).toBe(total("RESERVE") - total("RELEASE") - total("CONSUME") - total("REFUND"));
    expect(wallet.usedCredits).toBe(total("CONSUME"));
  });

  it("a repeated resolution of the same pitch changes nothing", async () => {
    // CONSUME and REFUND are the two movements a crash or a duplicate
    // webhook can genuinely attempt twice. The ledger's unique referenceId
    // is the backstop under pipeline.service.ts's own creditOutcome guard;
    // this checks the backstop alone holds the identity.
    const user = await newUser("invariant-replay");
    await grantCredits(prisma, { userId: user.id, amount: 5, type: "PURCHASE", referenceId: `purchase:${user.id}` });
    await prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 2, referenceId: `reserve:${user.id}` }));

    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `${user.id}-replay` }));
    const after = await getOrCreateWallet(prisma, user.id);
    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `${user.id}-replay` }));

    expect(await getOrCreateWallet(prisma, user.id)).toEqual(after);
    expect(await prisma.pitchCreditLedger.count({ where: { userId: user.id, type: "CONSUME" } })).toBe(1);
  });
});

describe("credit ledger reconciliation", () => {
  it("tracks every increase and decrease: the wallet always equals the sum of its ledger", async () => {
    const user = await newUser("ledger-walk");
    const expectWallet = async (available: number, reserved: number, used: number) => {
      expect(await getOrCreateWallet(prisma, user.id)).toEqual({ availableCredits: available, reservedCredits: reserved, usedCredits: used });
      expect((await reconcileCreditLedger(prisma, { userId: user.id })).mismatches).toEqual([]);
    };

    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `ledger-walk:purchase:${user.id}` });
    await expectWallet(20, 0, 0); // bought 20: +20 available
    await prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 5, referenceId: `ledger-walk:reserve:${user.id}` }));
    await expectWallet(15, 5, 0); // pitched 5: 5 held
    await prisma.$transaction((tx) => releasePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 1, referenceId: `ledger-walk:release:${user.id}` }));
    await expectWallet(16, 4, 0); // only 4 were eligible: 1 back
    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `ledger-walk-a-${user.id}` }));
    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `ledger-walk-b-${user.id}` }));
    await expectWallet(16, 2, 2); // 2 delivered: spent
    await prisma.$transaction((tx) => refundReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId: `ledger-walk-c-${user.id}` }));
    await expectWallet(17, 1, 2); // 1 failed for good: refunded
  });

  it("a repeated consume moves the wallet once, not twice (ledger written before the wallet)", async () => {
    const user = await newUser("ledger-dup");
    await grantCredits(prisma, { userId: user.id, amount: 3, type: "PURCHASE", referenceId: `ledger-dup:purchase:${user.id}` });
    await prisma.$transaction((tx) => reservePitchCredits(tx, { userId: user.id, batchId: TEST_BATCH_ID, amount: 2, referenceId: `ledger-dup:reserve:${user.id}` }));
    const pipelineId = `ledger-dup-${user.id}`;
    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId }));
    await prisma.$transaction((tx) => consumeReservedCredit(tx, { userId: user.id, batchId: TEST_BATCH_ID, pipelineId }));

    expect(await getOrCreateWallet(prisma, user.id)).toEqual({ availableCredits: 1, reservedCredits: 1, usedCredits: 1 });
    expect((await reconcileCreditLedger(prisma, { userId: user.id })).mismatches).toEqual([]);
  });

  it("reports a wallet that disagrees with its ledger, without changing it", async () => {
    const user = await newUser("ledger-drift");
    await grantCredits(prisma, { userId: user.id, amount: 10, type: "PURCHASE", referenceId: `ledger-drift:purchase:${user.id}` });
    // Something wrote the balance directly, bypassing the ledger.
    await prisma.pitchWallet.update({ where: { userId: user.id }, data: { availableCredits: 12 } });

    const { mismatches } = await reconcileCreditLedger(prisma, { userId: user.id });
    expect(mismatches).toEqual([
      {
        userId: user.id,
        wallet: { availableCredits: 12, reservedCredits: 0, usedCredits: 0 },
        expected: { availableCredits: 10, reservedCredits: 0, usedCredits: 0 },
      },
    ]);
    expect((await getOrCreateWallet(prisma, user.id)).availableCredits).toBe(12);
  });
});
