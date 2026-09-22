import type { PrismaClient } from "@pitchmyweb/db";
import { creditsForPlan, type Market, type PlanId } from "./plan-pricing";
import { grantCredits } from "./wallet.service";

// One-time migration onto the credit system, for accounts that bought before
// it existed. Until this runs, every such account's wallet holds only the free
// grant: they paid for "unlimited" pitches under the old model, and the new
// one would hand them ten. Run it as part of the release that switches
// enforcement on (see scripts/backfill-pitch-credits.ts), not afterwards.
//
// Two populations, in this order:
//
//   1. PAID orders placed before Order.credits existed (credits = 0). The
//      pack size is recoverable from the order's own plan and market, so
//      these are filled in from plan-pricing.ts and granted.
//   2. Users with User.planId set but no paid order at all — admin-assigned
//      access, which never had an order to derive anything from. Granted the
//      pack that plan denotes.
//
// Idempotent twice over. Grants in (1) use `purchase:<orderId>`, the exact
// referenceId claimOrder uses, so an order that was already claimed under the
// new system is a no-op here and a later claim of one backfilled here is a
// no-op there — the ledger's unique constraint is what guarantees it, not
// this script's own bookkeeping. Grants in (2) use `legacy-plan:<userId>`.

/** Plans whose pack size plan-pricing.ts knows. Anything else is reported, never guessed. */
function knownPlan(planId: string): planId is PlanId {
  return planId === "auto" || planId === "direct";
}

function knownMarket(market: string): market is Market {
  return market === "india" || market === "foreign";
}

/**
 * Restricts the sweep to named accounts instead of the whole database.
 * Operationally this is "re-run it for this one customer" after fixing a row
 * by hand; it is also what lets this be tested against the shared
 * development database without granting credits to every other test's users
 * halfway through their assertions. `payerEmails` reaches orders that have
 * no userId yet — an anonymous purchase whose buyer has not signed in.
 */
export type LegacyCreditBackfillScope = {
  userIds?: readonly string[];
  payerEmails?: readonly string[];
};

export type LegacyCreditBackfillResult = {
  ordersFilled: number;
  orderCreditsGranted: number;
  plansGranted: number;
  planCreditsGranted: number;
  /** Rows this script refused to guess at, with why — expected to be empty, worth reading if not. */
  skipped: Array<{ kind: "order" | "user"; id: string; reason: string }>;
};

export async function backfillLegacyPitchCredits(
  db: PrismaClient,
  options: { dryRun?: boolean; only?: LegacyCreditBackfillScope } = {},
): Promise<LegacyCreditBackfillResult> {
  const dryRun = options.dryRun ?? false;
  const only = options.only;
  const result: LegacyCreditBackfillResult = { ordersFilled: 0, orderCreditsGranted: 0, plansGranted: 0, planCreditsGranted: 0, skipped: [] };

  // (1) Paid orders that predate Order.credits.
  const orders = await db.order.findMany({
    where: {
      status: "PAID",
      credits: 0,
      ...(only ? { OR: [{ userId: { in: [...(only.userIds ?? [])] } }, { payerEmail: { in: [...(only.payerEmails ?? [])] } }] } : {}),
    },
    select: { id: true, userId: true, planId: true, market: true },
    orderBy: { createdAt: "asc" },
  });
  for (const order of orders) {
    if (!knownPlan(order.planId) || !knownMarket(order.market)) {
      result.skipped.push({ kind: "order", id: order.id, reason: `unknown plan/market (${order.planId}/${order.market})` });
      continue;
    }
    const credits = creditsForPlan(order.planId, order.market);
    if (!dryRun) {
      // The order records what was bought whether or not anyone has claimed
      // it yet: an unclaimed order backfilled here pays out correctly when
      // its buyer eventually signs in, through claimOrder's normal path.
      await db.order.update({ where: { id: order.id }, data: { credits } });
    }
    result.ordersFilled += 1;

    if (order.userId === null) continue;
    if (!dryRun) {
      await grantCredits(db, { userId: order.userId, amount: credits, type: "PURCHASE", orderId: order.id, referenceId: `purchase:${order.id}` });
    }
    result.orderCreditsGranted += credits;
  }

  // (2) Admin-assigned plans with no paid order behind them.
  const planUsers = await db.user.findMany({
    where: {
      planId: { not: null },
      orders: { none: { status: "PAID" } },
      ...(only ? { id: { in: [...(only.userIds ?? [])] } } : {}),
    },
    select: { id: true, planId: true },
  });
  for (const user of planUsers) {
    const planId = user.planId!;
    if (!knownPlan(planId)) {
      result.skipped.push({ kind: "user", id: user.id, reason: `unknown plan (${planId})` });
      continue;
    }
    // No order means no market was ever recorded for this access. India is
    // the default market everywhere else in the product, and both markets
    // grant the same pack anyway — if that ever stops being true, this needs
    // a real answer rather than a default.
    const credits = creditsForPlan(planId, "india");
    if (!dryRun) {
      await grantCredits(db, { userId: user.id, amount: credits, type: "PURCHASE", referenceId: `legacy-plan:${user.id}` });
    }
    result.plansGranted += 1;
    result.planCreditsGranted += credits;
  }

  return result;
}
