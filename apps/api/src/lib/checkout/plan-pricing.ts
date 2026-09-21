import { ValidationError } from "../errors";

// Server-side mirror of apps/web/src/data/plans.ts's pricing table. Kept as
// a deliberate duplicate, not a shared import (apps/web and apps/api are
// separate Next apps with no shared schema package bridging them — the same
// manual-review tradeoff already documented for Zod schema drift elsewhere
// in this codebase). For money specifically this duplication is load-bearing
// rather than incidental: the amount Razorpay actually charges must always
// be computed here, from a plan/market/coupon the client only *names*, never
// from a client-submitted amount. If you change a price in plans.ts, change
// it here too.

export type PlanId = "auto" | "direct";
export type Market = "india" | "foreign";
export type Currency = "USD" | "INR";

// Both markets are priced in INR; the market still controls which plan access is unlocked.
//
// TODO(product): `credits` below are placeholders, not a confirmed pack
// size — a purchase now grants a fixed quantity of pitch credits instead
// of unlimited access (see wallet.service.ts), and the real number per
// plan/market is a pricing decision this file cannot make on its own.
// Confirm before relying on these in production; nothing else in the
// credit system depends on the specific values, only on `credits` being
// present and correct.
const PLAN_PRICES: Record<PlanId, Record<Market, { amount: number; currency: Currency; credits: number }>> = {
  auto: { india: { amount: 149, currency: "INR", credits: 20 }, foreign: { amount: 329, currency: "INR", credits: 20 } },
  direct: { india: { amount: 289, currency: "INR", credits: 50 }, foreign: { amount: 489, currency: "INR", credits: 50 } },
};

// Demo coupons for the checkout preview (matches apps/web's demoCoupons).
// Move to a real, server-validated coupon store before relying on this for
// anything beyond the current fixed set.
const COUPONS: Record<string, number> = {
  FIRSTPITCH: 0.2,
  LAUNCH50: 0.5,
};

export type OrderAmount = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: Currency;
};

export function computeOrderAmountWithDiscount(planId: PlanId, market: Market, discountRate: number): OrderAmount {
  const prices = PLAN_PRICES[planId];
  if (!prices) throw new ValidationError(`Unknown plan: ${planId}`);
  const price = prices[market];
  if (price === undefined) throw new ValidationError(`Unknown market: ${market}`);
  const subtotalCents = Math.round(price.amount * 100);
  const discountCents = Math.round(subtotalCents * Math.min(1, Math.max(0, discountRate)));
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents, currency: price.currency };
}

/**
 * Computes the amount Razorpay will actually charge, in the currency's
 * smallest unit (cents for USD, paise for INR — both are amount * 100), from
 * a plan/market/coupon the client only names. Throws ValidationError for an
 * unknown planId/market — Zod already constrains these to the known enum
 * values before this is called, so this is a defense-in-depth check, not the
 * primary validation.
 */
export function computeOrderAmount(planId: PlanId, market: Market, couponCode?: string | null): OrderAmount {
  const discountRate = couponCode ? (COUPONS[couponCode.toUpperCase()] ?? 0) : 0;
  return computeOrderAmountWithDiscount(planId, market, discountRate);
}

/**
 * How many pitch credits a plan/market purchase grants. A coupon discounts
 * the price, never the credit count — a 50%-off coupon still buys the full
 * pack, it just costs less.
 */
export function creditsForPlan(planId: PlanId, market: Market): number {
  const prices = PLAN_PRICES[planId];
  if (!prices) throw new ValidationError(`Unknown plan: ${planId}`);
  const price = prices[market];
  if (price === undefined) throw new ValidationError(`Unknown market: ${market}`);
  return price.credits;
}
