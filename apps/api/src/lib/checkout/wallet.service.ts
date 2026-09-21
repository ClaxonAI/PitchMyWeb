import type { Prisma, PrismaClient } from "@pitchmyweb/db";
import { FREE_PITCH_ALLOWANCE } from "./paid-access";
import { InsufficientPitchCreditsError, isUniqueConstraintViolation } from "../errors";

// The pitch credit engine (see docs/pitch-credits-plan for the full design).
// One wallet per user, created lazily on first touch rather than at
// registration — most visitors never need one. Every mutation below is a
// single conditional UPDATE guarded by the current balance
// (`WHERE availableCredits >= amount`, or `WHERE reservedCredits >= 1`),
// which is Postgres's own compare-and-swap under the row lock a transaction
// holds for its duration — no SELECT..FOR UPDATE, no version column.
//
// available + reserved + used always equals total granted. A credit only
// ever moves one of these ways:
//   PURCHASE/FREE_GRANT  -> available
//   RESERVE   available  -> reserved   (selection time, an upper bound)
//   RELEASE   reserved   -> available  (reserved more than turned out eligible)
//   CONSUME   reserved   -> used       (the pitch was actually sent)
//   REFUND    reserved   -> available  (the pitch finally, non-retryably failed)
// CONSUME and REFUND are mutually exclusive and each happen at most once per
// reservation — see pipeline.service.ts's use of LeadPipeline.creditOutcome
// as the concurrency guard, and PitchCreditLedger.referenceId as the
// independent second layer against a duplicate call outside that guard.

type Db = PrismaClient | Prisma.TransactionClient;

export type PitchWalletSnapshot = {
  availableCredits: number;
  reservedCredits: number;
  usedCredits: number;
};

export async function getOrCreateWallet(db: Db, userId: string): Promise<PitchWalletSnapshot> {
  const wallet = await db.pitchWallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return wallet;
}

/**
 * Idempotent credit grant (a purchase claimed, or a free-tier grant).
 * `referenceId` is the dedup key — a repeat call with the same id (an order
 * claimed twice, a free grant issued twice) is a no-op that returns the
 * wallet unchanged, never a second credit. Callers pass a transaction client
 * when this needs to commit alongside other writes (see checkout.service.ts's
 * claimOrder); a bare PrismaClient is fine standalone.
 */
export async function grantCredits(
  db: Db,
  input: { userId: string; amount: number; type: "PURCHASE" | "FREE_GRANT"; orderId?: string; referenceId: string },
): Promise<PitchWalletSnapshot> {
  if (input.amount <= 0) return getOrCreateWallet(db, input.userId);

  try {
    await db.pitchCreditLedger.create({
      data: { userId: input.userId, type: input.type, amount: input.amount, orderId: input.orderId, referenceId: input.referenceId },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return getOrCreateWallet(db, input.userId);
    throw error;
  }

  return db.pitchWallet.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, availableCredits: input.amount },
    update: { availableCredits: { increment: input.amount } },
  });
}

/**
 * Grants the free-tier allowance exactly once per user. Lazy — called
 * wherever a wallet is first read for a user (getAccessSnapshot), so no
 * registration/login/OAuth callback path needs to know this exists.
 */
export async function ensureFreeGrant(db: PrismaClient, userId: string): Promise<PitchWalletSnapshot> {
  return grantCredits(db, { userId, amount: FREE_PITCH_ALLOWANCE, type: "FREE_GRANT", referenceId: `free-grant:${userId}` });
}

/**
 * The compare-and-swap reservation primitive: moves `amount` from
 * available to reserved, atomically, or throws
 * InsufficientPitchCreditsError with the real current balance. Must run
 * inside the same transaction as whatever creates the PitchBatch/
 * LeadPipeline rows this reservation is for, so a crash between the two
 * can never leave credits reserved with nothing to show for them.
 */
export async function reservePitchCredits(tx: Prisma.TransactionClient, userId: string, amount: number, referenceId: string): Promise<void> {
  const claimed = await tx.pitchWallet.updateMany({
    where: { userId, availableCredits: { gte: amount } },
    data: { availableCredits: { decrement: amount }, reservedCredits: { increment: amount } },
  });
  if (claimed.count !== 1) {
    const wallet = await getOrCreateWallet(tx, userId);
    throw new InsufficientPitchCreditsError(wallet.availableCredits, amount);
  }
  await tx.pitchCreditLedger.create({ data: { userId, type: "RESERVE", amount, referenceId } });
}

/**
 * Returns part of an active reservation to available — used when fewer
 * eligible leads existed than the amount reserved as an upper bound (see
 * selection.service.ts). Not idempotency-guarded by a unique referenceId
 * the way CONSUME/REFUND are: this always runs inside the same transaction
 * that performed the RESERVE moments earlier, never replayed independently.
 */
export async function releasePitchCredits(tx: Prisma.TransactionClient, userId: string, amount: number, referenceId: string): Promise<void> {
  if (amount <= 0) return;
  await tx.pitchWallet.update({
    where: { userId },
    data: { reservedCredits: { decrement: amount }, availableCredits: { increment: amount } },
  });
  await tx.pitchCreditLedger.create({ data: { userId, type: "RELEASE", amount, referenceId } });
}
