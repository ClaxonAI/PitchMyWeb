import type { PrismaClient } from "@pitchmyweb/db";
import { PaymentRequiredError, ValidationError } from "../errors";

// Discovery (Maps scrape via apps/python-discovery) is a paid action.
// Tests skip the gate (NODE_ENV=test) unless REQUIRE_PAID_FOR_DISCOVERY is
// forced on. Locally, set REQUIRE_PAID_FOR_DISCOVERY=false to scrape without
// a Razorpay order.
//
// Newly registered users still get a small free pitch allowance so they can
// try the product before paying. Usage is reserved by campaign.targetCount
// once a campaign has started (left DRAFT/READY).

type Env = Record<string, string | undefined>;
export type DiscoveryMarket = "india" | "foreign";

/** Free pitches granted to every unpaid account on first login / signup. */
export const FREE_PITCH_ALLOWANCE = 10;
const ALL_MARKETS: DiscoveryMarket[] = ["india", "foreign"];

const STARTED_CAMPAIGN_STATUSES = ["RUNNING", "PROCESSING", "COMPLETED", "FAILED"] as const;

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
  freePitchesRemaining: number | null;
  canDiscover: boolean;
};

/**
 * Everything /api/me needs about a user's access from one parallel round of
 * queries. The individual helpers above each re-read the user and orders, which
 * made the profile endpoint (hit on every dashboard navigation) run the same
 * queries several times in sequence.
 */
export async function getAccessSnapshot(db: PrismaClient, userId: string, env: Env = process.env): Promise<AccessSnapshot> {
  if (!isPaidDiscoveryRequired(env)) {
    return { hasPaidAccess: true, allowedMarkets: ALL_MARKETS, freePitchesRemaining: null, canDiscover: true };
  }
  const [user, paidOrders] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { planId: true } }),
    db.order.findMany({ where: { userId, status: "PAID" }, select: { market: true } }),
  ]);
  const paid = Boolean(user?.planId) || paidOrders.length > 0;
  const markets = paidOrders.map((order) => order.market).filter((market): market is DiscoveryMarket => ALL_MARKETS.includes(market as DiscoveryMarket));
  const allowedMarkets: DiscoveryMarket[] = markets.length > 0 ? [...new Set(markets)] : user?.planId ? ALL_MARKETS : ["india"];
  if (paid) return { hasPaidAccess: true, allowedMarkets, freePitchesRemaining: null, canDiscover: true };

  const freePitchesRemaining = Math.max(0, FREE_PITCH_ALLOWANCE - (await countUsedFreePitches(db, userId)));
  return { hasPaidAccess: false, allowedMarkets, freePitchesRemaining, canDiscover: freePitchesRemaining > 0 };
}

export async function assertMarketAllowed(db: PrismaClient, userId: string, market: string, env: Env = process.env): Promise<void> {
  const allowedMarkets = await getAllowedMarkets(db, userId, env);
  if (!allowedMarkets.includes(market as DiscoveryMarket)) {
    throw new ValidationError(`Your plan does not include ${market === "foreign" ? "foreign" : "India"} leads. Purchase a plan for that market to continue.`);
  }
}

/**
 * Free pitches consumed by started campaigns. Pitches that failed are
 * refunded automatically because usage is derived, never stored:
 *  - RUNNING / PROCESSING: the campaign reserves targetCount, minus every
 *    lead pipeline that has already failed.
 *  - COMPLETED with pitches: only pitches actually taken on (pipelines that
 *    did not fail) count, so a shortfall is refunded. Older completed
 *    campaigns with no pipeline rows keep charging their full targetCount.
 *  - FAILED: only pitches that actually went through count, so a campaign
 *    that failed outright costs nothing.
 * Failed pitches are re-queued by the maintenance job (see
 * pipeline-maintenance.job.ts); when one is delivered later it counts again.
 */
export async function countUsedFreePitches(db: PrismaClient, userId: string): Promise<number> {
  const campaigns = await db.campaign.findMany({
    where: { userId, status: { in: [...STARTED_CAMPAIGN_STATUSES] } },
    select: { id: true, status: true, targetCount: true },
  });
  if (campaigns.length === 0) return 0;

  const grouped = await db.leadPipeline.groupBy({
    by: ["campaignId", "stage"],
    where: { campaignId: { in: campaigns.map((campaign) => campaign.id) } },
    _count: { _all: true },
  });
  const failed = new Map<string, number>();
  const delivered = new Map<string, number>();
  for (const row of grouped) {
    const target = row.stage === "FAILED" ? failed : delivered;
    target.set(row.campaignId, (target.get(row.campaignId) ?? 0) + row._count._all);
  }

  let used = 0;
  for (const campaign of campaigns) {
    const notFailed = delivered.get(campaign.id) ?? 0;
    const failedCount = failed.get(campaign.id) ?? 0;
    const finished = campaign.status === "COMPLETED" || campaign.status === "FAILED";
    // A finished campaign only costs what it actually took on: a search that
    // found fewer businesses than the target must not keep the difference
    // reserved. Campaigns with no pipeline rows at all predate per-pitch
    // tracking (or never selected anything) and keep the old flat charge, so
    // they are not silently re-credited.
    const settled = finished && (notFailed + failedCount > 0 || campaign.status === "FAILED");
    used += settled ? Math.min(campaign.targetCount, notFailed) : Math.max(notFailed, campaign.targetCount - failedCount);
  }
  return used;
}

/**
 * Free pitches still available for an unpaid user. Paid users (and
 * environments where paid discovery is not required) return null — the free
 * budget does not apply.
 */
export async function getFreePitchesRemaining(db: PrismaClient, userId: string, env: Env = process.env): Promise<number | null> {
  if (!isPaidDiscoveryRequired(env)) return null;
  if (await userHasPaidAccess(db, userId)) return null;
  return Math.max(0, FREE_PITCH_ALLOWANCE - (await countUsedFreePitches(db, userId)));
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