import type { PrismaClient } from "@pitchmyweb/db";
import { PaymentRequiredError, ValidationError } from "../errors";
import { ensureFreeGrant } from "./wallet.service";

// Discovery (Maps scrape via apps/python-discovery) is a paid action.
// Tests skip the gate (NODE_ENV=test) unless REQUIRE_PAID_FOR_DISCOVERY is
// forced on. Locally, set REQUIRE_PAID_FOR_DISCOVERY=false to scrape without
// a Razorpay order.
//
// Newly registered users still get a small free pitch allowance so they can
// try the product before paying — granted once, lazily, as real pitch
// credits in PitchWallet (see wallet.service.ts). Usage was previously
// derived on every read from Campaign.targetCount and LeadPipeline stages;
// it is now a real, stored balance, reserved/consumed/refunded by the
// pitch-selection flow (selection.service.ts, pipeline.service.ts) rather
// than recomputed here.
//
// `userHasPaidAccess`'s "paid = unlimited, skip the budget check entirely"
// bypass below is transitional: a paid purchase is now a *quantity* of
// credits (Order.credits), not unlimited access, so a paid user's own
// wallet balance is what should gate them too. This file still treats a
// paid user as ungated for one more phase — the real, uniform,
// reservation-based enforcement (every user checked against their actual
// balance, no bypass) lands in selection.service.ts alongside the atomic
// reservation primitive it depends on.

type Env = Record<string, string | undefined>;
export type DiscoveryMarket = "india" | "foreign";

/** Free pitch credits granted once, lazily, to every account (paid or not) — see ensureFreeGrant. */
export const FREE_PITCH_ALLOWANCE = 10;
const ALL_MARKETS: DiscoveryMarket[] = ["india", "foreign"];

export function isPaidDiscoveryRequired(env: Env = process.env): boolean {
  const raw = (env.REQUIRE_PAID_FOR_DISCOVERY ?? "").trim().toLowerCase();
  // Vitest loads apps/api/.env, which may force REQUIRE_PAID_FOR_DISCOVERY.
  // Campaign-run tests must keep scraping ungated unless a test opts in.
  if (env.VITEST === "true") {
    return ["1", "true", "yes", "on"].includes((env.REQUIRE_PAID_FOR_DISCOVERY_IN_TESTS ?? "").trim().toLowerCase());
  }
  if (["0", "false", "no", "off"].includes(raw)) return false;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  return (env.NODE_ENV ?? "").trim().toLowerCase() !== "test";
}

export async function userHasPaidAccess(db: PrismaClient, userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { planId: true } });
  if (user?.planId) return true;
  const paid = await db.order.count({ where: { userId, status: "PAID" } });
  return paid > 0;
}

/** Markets unlocked by a user's paid orders. Free discovery is India-only. */
export async function getAllowedMarkets(db: PrismaClient, userId: string, env: Env = process.env): Promise<DiscoveryMarket[]> {
  if (!isPaidDiscoveryRequired(env)) return ALL_MARKETS;

  const user = await db.user.findUnique({ where: { id: userId }, select: { planId: true } });
  const paidOrders = await db.order.findMany({ where: { userId, status: "PAID" }, select: { market: true } });
  const markets = paidOrders.map((order) => order.market).filter((market): market is DiscoveryMarket => ALL_MARKETS.includes(market as DiscoveryMarket));

  // Admin-assigned plans predate market-specific purchases and remain usable
  // for both markets until the account has an explicit paid order.
  if (markets.length === 0 && user?.planId) return ALL_MARKETS;
  return markets.length > 0 ? [...new Set(markets)] : ["india"];
}

export type AccessSnapshot = {
  hasPaidAccess: boolean;
  allowedMarkets: DiscoveryMarket[];
  /** @deprecated derived from `wallet.availableCredits` for unpaid users; use `wallet` directly. Removed once apps/web reads `wallet` instead (Phase 7). */
  freePitchesRemaining: number | null;
  canDiscover: boolean;
  /** The real, stored pitch-credit balance (see wallet.service.ts) — the source of truth going forward. */
  wallet: { availableCredits: number; reservedCredits: number; usedCredits: number };
};

/**
 * Everything /api/me needs about a user's access from one parallel round of
 * queries. The individual helpers above each re-read the user and orders, which
 * made the profile endpoint (hit on every dashboard navigation) run the same
 * queries several times in sequence.
 */
export async function getAccessSnapshot(db: PrismaClient, userId: string, env: Env = process.env): Promise<AccessSnapshot> {
  // Every account gets its wallet ensured (and the one-time free grant
  // applied if it hasn't been yet) on the very first read, paid or not —
  // credits from a purchase and from the free grant sit in the same pool.
  const wallet = await ensureFreeGrant(db, userId);

  if (!isPaidDiscoveryRequired(env)) {
    return { hasPaidAccess: true, allowedMarkets: ALL_MARKETS, freePitchesRemaining: null, canDiscover: true, wallet };
  }
  const [user, paidOrders] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { planId: true } }),
    db.order.findMany({ where: { userId, status: "PAID" }, select: { market: true } }),
  ]);
  const paid = Boolean(user?.planId) || paidOrders.length > 0;
  const markets = paidOrders.map((order) => order.market).filter((market): market is DiscoveryMarket => ALL_MARKETS.includes(market as DiscoveryMarket));
  const allowedMarkets: DiscoveryMarket[] = markets.length > 0 ? [...new Set(markets)] : user?.planId ? ALL_MARKETS : ["india"];
  // Transitional (see header comment): a paid user still bypasses the
  // budget check entirely for one more phase, so freePitchesRemaining stays
  // the old "no cap" sentinel for them even though their wallet now holds a
  // real, finite number.
  if (paid) return { hasPaidAccess: true, allowedMarkets, freePitchesRemaining: null, canDiscover: true, wallet };

  return { hasPaidAccess: false, allowedMarkets, freePitchesRemaining: wallet.availableCredits, canDiscover: wallet.availableCredits > 0, wallet };
}

export async function assertMarketAllowed(db: PrismaClient, userId: string, market: string, env: Env = process.env): Promise<void> {
  const allowedMarkets = await getAllowedMarkets(db, userId, env);
  if (!allowedMarkets.includes(market as DiscoveryMarket)) {
    throw new ValidationError(`Your plan does not include ${market === "foreign" ? "foreign" : "India"} leads. Purchase a plan for that market to continue.`);
  }
}

/**
 * Free pitches still available for an unpaid user, read directly from
 * PitchWallet rather than recomputed from campaign/pipeline state (the old
 * `countUsedFreePitches` approach — every reservation/consume/refund is now
 * a real, stored credit movement, so there is nothing left to derive).
 * Paid users (and environments where paid discovery is not required) return
 * null — the free budget does not apply.
 */
export async function getFreePitchesRemaining(db: PrismaClient, userId: string, env: Env = process.env): Promise<number | null> {
  if (!isPaidDiscoveryRequired(env)) return null;
  if (await userHasPaidAccess(db, userId)) return null;
  const wallet = await ensureFreeGrant(db, userId);
  return wallet.availableCredits;
}

export async function userCanDiscover(db: PrismaClient, userId: string, env: Env = process.env): Promise<boolean> {
  if (!isPaidDiscoveryRequired(env)) return true;
  if (await userHasPaidAccess(db, userId)) return true;
  const remaining = await getFreePitchesRemaining(db, userId, env);
  return (remaining ?? 0) > 0;
}

/**
 * Ensures an unpaid user is not requesting more pitches than their free
 * allowance still has. Paid / ungated users are a no-op.
 */
export async function assertFreePitchBudget(db: PrismaClient, userId: string, requestedPitches: number, env: Env = process.env): Promise<void> {
  if (!isPaidDiscoveryRequired(env)) return;
  if (await userHasPaidAccess(db, userId)) return;

  const remaining = (await getFreePitchesRemaining(db, userId, env)) ?? 0;
  if (remaining <= 0) {
    throw new PaymentRequiredError(`You've used your ${FREE_PITCH_ALLOWANCE} free pitches. Pay for a plan to continue.`);
  }
  if (requestedPitches > remaining) {
    throw new ValidationError(
      remaining === 1
        ? `Only 1 free pitch left. Set how many leads to 1, or pay for a plan.`
        : `Only ${remaining} free pitches left. Set how many leads to ${remaining} or fewer, or pay for a plan.`,
    );
  }
}

export async function assertPaidDiscoveryAllowed(db: PrismaClient, userId: string, env: Env = process.env): Promise<void> {
  if (!isPaidDiscoveryRequired(env)) return;
  if (await userHasPaidAccess(db, userId)) return;

  const remaining = (await getFreePitchesRemaining(db, userId, env)) ?? 0;
  if (remaining <= 0) {
    throw new PaymentRequiredError(`You've used your ${FREE_PITCH_ALLOWANCE} free pitches. Pay for a plan to continue.`);
  }
}