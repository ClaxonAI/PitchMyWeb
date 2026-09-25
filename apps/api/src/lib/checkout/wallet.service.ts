import type { Prisma, PrismaClient } from "@pitchmyweb/db";
import { FREE_PITCH_ALLOWANCE } from "./paid-access";
import { InsufficientPitchCreditsError, isUniqueConstraintViolation } from "../errors";
import { emitEvent } from "../observability/events";

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
// reconcileCreditLedger (below) checks that the wallet still equals the sum
// of its ledger.

type Db = PrismaClient | Prisma.TransactionClient;

export type PitchWalletSnapshot = {
  availableCredits: number;
  reservedCredits: number;
  usedCredits: number;
};

export type CreditLedgerEntry = {
  id: string;
  type: string;
  amount: number;
  batchId: string | null;
  pipelineId: string | null;
  orderId: string | null;
  createdAt: Date;
};

/**
 * The user's own credit history, newest first, alongside the balance it adds
 * up to — "where did my credits go?" answered from the ledger rather than
 * from anybody's recollection. Every movement is here, including the
 * RESERVE/RELEASE pairs that never cost anything, because a reservation that
 * was released is exactly the kind of thing a user notices and asks about.
 *
 * Scoped by userId in the query, never fetched and filtered afterwards.
 */
export async function listCreditLedger(
  db: PrismaClient,
  userId: string,
  query: { page: number; pageSize: number },
): Promise<{ wallet: PitchWalletSnapshot; items: CreditLedgerEntry[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const where = { userId };
  const [wallet, items, total] = await Promise.all([
    getOrCreateWallet(db, userId),
    db.pitchCreditLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, type: true, amount: true, batchId: true, pipelineId: true, orderId: true, createdAt: true },
    }),
    db.pitchCreditLedger.count({ where }),
  ]);
  return { wallet, items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function getOrCreateWallet(db: Db, userId: string): Promise<PitchWalletSnapshot> {
  // Selected rather than returned whole: this snapshot is served straight to
  // the client by /api/me and the ledger endpoint, and a bare `upsert`
  // returns the row — userId, timestamps and all — so the response would
  // quietly carry more than the type says it does.
  return db.pitchWallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { availableCredits: true, reservedCredits: true, usedCredits: true },
  });
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
 * A whole-batch credit movement (RESERVE / RELEASE), as opposed to the
 * single-pitch CONSUME/REFUND below. `batchId` is recorded on the ledger row
 * so the credit history can say *which* send this movement belonged to — "12
 * credits reserved" is only an answer to "where did my credits go?" if the
 * user can see what they were reserved for.
 */
export type BatchCreditMovement = {
  userId: string;
  batchId: string;
  amount: number;
  /** Idempotency/audit key, e.g. `reserve:<batchId>`. */
  referenceId: string;
};

/**
 * The compare-and-swap reservation primitive: moves `amount` from
 * available to reserved, atomically, or throws
 * InsufficientPitchCreditsError with the real current balance. Must run
 * inside the same transaction as whatever creates the PitchBatch/
 * LeadPipeline rows this reservation is for, so a crash between the two
 * can never leave credits reserved with nothing to show for them.
 */
export async function reservePitchCredits(tx: Prisma.TransactionClient, input: BatchCreditMovement): Promise<void> {
  const { userId, amount } = input;
  const claimed = await tx.pitchWallet.updateMany({
    where: { userId, availableCredits: { gte: amount } },
    data: { availableCredits: { decrement: amount }, reservedCredits: { increment: amount } },
  });
  if (claimed.count !== 1) {
    const wallet = await getOrCreateWallet(tx, userId);
    throw new InsufficientPitchCreditsError(wallet.availableCredits, amount);
  }
  await tx.pitchCreditLedger.create({ data: { userId, batchId: input.batchId, type: "RESERVE", amount, referenceId: input.referenceId } });
}

/**
 * Returns part of an active reservation to available — used when fewer
 * eligible leads existed than the amount reserved as an upper bound (see
 * selection.service.ts). Not idempotency-guarded by a unique referenceId
 * the way CONSUME/REFUND are: this always runs inside the same transaction
 * that performed the RESERVE moments earlier, never replayed independently.
 */
export async function releasePitchCredits(tx: Prisma.TransactionClient, input: BatchCreditMovement): Promise<void> {
  const { userId, amount } = input;
  if (amount <= 0) return;
  await tx.pitchWallet.update({
    where: { userId },
    data: { reservedCredits: { decrement: amount }, availableCredits: { increment: amount } },
  });
  await tx.pitchCreditLedger.create({ data: { userId, batchId: input.batchId, type: "RELEASE", amount, referenceId: input.referenceId } });
}

// --- Resolving a single reserved pitch (pipeline.service.ts) --------------
//
// Every reservation ends exactly one of these two ways, never both, never
// neither. Both are called only after pipeline.service.ts's own
// LeadPipeline.creditOutcome conditional update has already won the right
// to resolve this specific pipeline (`WHERE creditOutcome IS NULL`) — that
// is the primary concurrency guard. The ledger's unique `referenceId`
// (`consume:<pipelineId>` / `refund:<pipelineId>`) is a second, independent
// backstop: swallowing its P2002 here means even a call that somehow ran
// twice outside that guard still only ever records one credit movement.

/**
 * Writes the ledger row first and moves the wallet only if that write was
 * new. The order matters: the wallet update used to run first, so a
 * duplicate call moved the balance a second time while the ledger's unique
 * referenceId quietly dropped the second row — the balance drifted away from
 * its own history with nothing recording why.
 *
 * A wallet with nothing reserved should be impossible here (the pipeline
 * reserved this credit); if it happens the ledger row stays, the wallet is
 * left alone, and the mismatch is raised as an alert for
 * reconcileCreditLedger to report rather than hidden.
 */
async function resolveReservedCredit(
  tx: Prisma.TransactionClient,
  input: { userId: string; batchId: string; pipelineId: string; type: "CONSUME" | "REFUND" },
): Promise<void> {
  const referenceId = `${input.type === "CONSUME" ? "consume" : "refund"}:${input.pipelineId}`;
  try {
    await tx.pitchCreditLedger.create({
      data: { userId: input.userId, batchId: input.batchId, pipelineId: input.pipelineId, type: input.type, amount: 1, referenceId },
    });
  } catch (error) {
    // Already recorded: this movement has happened, so the wallet has too.
    if (isUniqueConstraintViolation(error)) return;
    throw error;
  }
  const moved = await tx.pitchWallet.updateMany({
    where: { userId: input.userId, reservedCredits: { gte: 1 } },
    data:
      input.type === "CONSUME"
        ? { reservedCredits: { decrement: 1 }, usedCredits: { increment: 1 } }
        : { reservedCredits: { decrement: 1 }, availableCredits: { increment: 1 } },
  });
  if (moved.count !== 1) {
    emitEvent("credits.ledger_mismatch", { userId: input.userId, pipelineId: input.pipelineId, type: input.type, reason: "no_reserved_credit" }, { level: "error", alert: true });
  }
}

/** A reserved pitch actually sent: reserved -> used. */
export async function consumeReservedCredit(tx: Prisma.TransactionClient, input: { userId: string; batchId: string; pipelineId: string }): Promise<void> {
  await resolveReservedCredit(tx, { ...input, type: "CONSUME" });
}

/** A reserved pitch that finally, non-retryably failed: reserved -> available. */
export async function refundReservedCredit(tx: Prisma.TransactionClient, input: { userId: string; batchId: string; pipelineId: string }): Promise<void> {
  await resolveReservedCredit(tx, { ...input, type: "REFUND" });
}

// --- Reconciliation --------------------------------------------------------

export type LedgerMismatch = {
  userId: string;
  wallet: PitchWalletSnapshot;
  /** What the ledger says the wallet should hold. */
  expected: PitchWalletSnapshot;
};

/**
 * Rebuilds every wallet from its ledger and reports the ones that disagree.
 * The ledger is the history and the wallet is its running total, so they
 * must always match:
 *
 *   available = PURCHASE + FREE_GRANT - RESERVE + RELEASE + REFUND
 *   reserved  = RESERVE - RELEASE - CONSUME - REFUND
 *   used      = CONSUME
 *
 * Read-only: it reports, it never "fixes" a balance — a mismatch means a bug
 * to find, and silently overwriting the wallet would erase the evidence.
 * Run by every pipeline-maintenance pass (alerting on any mismatch) and on
 * demand with `npm run credits:check -w apps/api`.
 */
export async function reconcileCreditLedger(db: PrismaClient, filter: { userId?: string } = {}): Promise<{ checked: number; mismatches: LedgerMismatch[] }> {
  const where = filter.userId ? { userId: filter.userId } : {};
  const [sums, wallets] = await Promise.all([
    db.pitchCreditLedger.groupBy({ by: ["userId", "type"], where, _sum: { amount: true } }),
    db.pitchWallet.findMany({ where, select: { userId: true, availableCredits: true, reservedCredits: true, usedCredits: true } }),
  ]);

  const totals = new Map<string, Record<string, number>>();
  for (const row of sums) {
    const byType = totals.get(row.userId) ?? {};
    byType[row.type] = row._sum.amount ?? 0;
    totals.set(row.userId, byType);
  }

  const mismatches: LedgerMismatch[] = [];
  const userIds = new Set([...wallets.map((wallet) => wallet.userId), ...totals.keys()]);
  const walletByUser = new Map(wallets.map((wallet) => [wallet.userId, wallet]));
  for (const userId of userIds) {
    const t = totals.get(userId) ?? {};
    const n = (type: string) => t[type] ?? 0;
    const expected = {
      availableCredits: n("PURCHASE") + n("FREE_GRANT") - n("RESERVE") + n("RELEASE") + n("REFUND"),
      reservedCredits: n("RESERVE") - n("RELEASE") - n("CONSUME") - n("REFUND"),
      usedCredits: n("CONSUME"),
    };
    const row = walletByUser.get(userId);
    const wallet = row
      ? { availableCredits: row.availableCredits, reservedCredits: row.reservedCredits, usedCredits: row.usedCredits }
      : { availableCredits: 0, reservedCredits: 0, usedCredits: 0 };
    if (
      wallet.availableCredits !== expected.availableCredits ||
      wallet.reservedCredits !== expected.reservedCredits ||
      wallet.usedCredits !== expected.usedCredits
    ) {
      mismatches.push({ userId, wallet, expected });
    }
  }
  return { checked: userIds.size, mismatches };
}
