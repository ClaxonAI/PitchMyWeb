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
// There is no longer a "paid = unlimited" bypass. A purchase grants a
// quantity of credits (Order.credits), so a paid user with an empty wallet
// is in exactly the same position as a free user with an empty wallet, and
// this file gates them identically. `userHasPaidAccess` survives only for
// what it still genuinely decides — which markets an account may search,
// and which wording the dashboard shows — never as a spending cap.
//
// Nor is there a per-request quantity check any more. The old
// assertFreePitchBudget compared a campaign's targetCount against the
// remaining allowance at *creation* time, which charged the user for leads
// that did not exist yet: a search that found fewer businesses than asked
// for, or leads with no reachable phone, still consumed the budget. Credits
// are now reserved at selection time against real eligible leads
// (selection.service.ts::reservePitchBatch), so all that is needed here is
// the cheap "does this account have any spending power at all" check that
// keeps a zero-credit user from starting a Serper-billed scrape.

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
  /** Has at least one paid order. Decides markets and dashboard wording — never how much can be spent. */
  hasPaidAccess: boolean;
  allowedMarkets: DiscoveryMarket[];
  canDiscover: boolean;
  /** The real, stored pitch-credit balance (see wallet.service.ts) — the only source of truth for spending. */
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
    return { hasPaidAccess: true, allowedMarkets: ALL_MARKETS, canDiscover: true, wallet };
  }
  const [user, paidOrders] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { planId: true } }),
    db.order.findMany({ where: { userId, status: "PAID" }, select: { market: true } }),
  ]);
  const paid = Boolean(user?.planId) || paidOrders.length > 0;
  const markets = paidOrders.map((order) => order.market).filter((market): market is DiscoveryMarket => ALL_MARKETS.includes(market as DiscoveryMarket));
  const allowedMarkets: DiscoveryMarket[] = markets.length > 0 ? [...new Set(markets)] : user?.planId ? ALL_MARKETS : ["india"];
  // One rule for everybody: can this wallet still pay for a pitch?
  return { hasPaidAccess: paid, allowedMarkets, canDiscover: wallet.availableCredits + wallet.reservedCredits > 0, wallet };
}

export async function assertMarketAllowed(db: PrismaClient, userId: string, market: string, env: Env = process.env): Promise<void> {
  const allowedMarkets = await getAllowedMarkets(db, userId, env);
  if (!allowedMarkets.includes(market as DiscoveryMarket)) {
    throw new ValidationError(`Your plan does not include ${market === "foreign" ? "foreign" : "India"} leads. Purchase a plan for that market to continue.`);
  }
}

/**
 * Credits this account could still spend on a pitch: available plus already
 * reserved, because a reservation that is mid-flight is capacity the user
 * has paid for and has not lost — it will either send (consumed) or fail
 * (refunded). Null when paid discovery is not required at all, meaning "no
 * limit applies here", which is not the same as zero.
 */
export async function getSpendableCredits(db: PrismaClient, userId: string, env: Env = process.env): Promise<number | null> {
  if (!isPaidDiscoveryRequired(env)) return null;
  const wallet = await ensureFreeGrant(db, userId);
  return wallet.availableCredits + wallet.reservedCredits;
}

export async function userCanDiscover(db: PrismaClient, userId: string, env: Env = process.env): Promise<boolean> {
  const spendable = await getSpendableCredits(db, userId, env);
  return spendable === null || spendable > 0;
}

/**
 * The gate in front of every Serper-billed action (creating a campaign,
 * running one): an account with no credits at all cannot start work whose
 * results it could never pitch. Deliberately does *not* look at how many
 * leads were asked for — that is decided against real eligible leads at
 * selection time, not guessed here before any lead exists.
 */
export async function assertCanStartDiscovery(db: PrismaClient, userId: string, env: Env = process.env): Promise<void> {
  const spendable = await getSpendableCredits(db, userId, env);
  if (spendable === null || spendable > 0) return;
  // Two genuinely different situations with two different next steps: one
  // account has never bought anything, the other has and has spent it.
  throw new PaymentRequiredError(
    (await userHasPaidAccess(db, userId))
      ? "You have no pitch credits left. Buy another credit pack to continue."
      : `You've used your ${FREE_PITCH_ALLOWANCE} free pitches. Buy a credit pack to continue.`,
  );
}