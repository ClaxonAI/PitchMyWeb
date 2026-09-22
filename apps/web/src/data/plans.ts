import type { Market, Plan, PlanId, PlanPrice } from "@/types";

// Batch prices: India is priced in INR (no forex fees for Indian buyers),
// foreign plans are also charged in INR. Every price on the site reads from this file — keep
// apps/api's lib/checkout/plan-pricing.ts in sync (that's the server-side
// copy that actually decides what Razorpay charges; see its own header
// comment for why it's a deliberate duplicate, not a shared import).
//
// `batchSize` is now load-bearing in the same way the prices are: it is the
// number of pitch credits the purchase puts in the buyer's wallet, mirrored
// as `credits` in that same server-side table. A mismatch means the page
// promises one number of pitches and the wallet grants another.
export const plans: Plan[] = [
  {
    id: "auto",
    name: "Auto",
    bestFor: "WhatsApp Business users",
    headline: "We pitch. You close.",
    summary: "Link your WhatsApp once. Twenty pitches go out from your own number while you get on with your day.",
    unitLabel: "pitches",
    batchSize: 20,
    prices: [
      { market: "india", amount: 149, currency: "INR" },
      { market: "foreign", amount: 329, currency: "INR" },
    ],
    features: [
      "20 verified businesses with no website",
      "A custom sample site for each one",
      "A short demo recording per site",
      "Sent automatically from your WhatsApp",
    ],
  },
  {
    id: "direct",
    name: "Direct",
    bestFor: "Personal WhatsApp users",
    headline: "We build. You send.",
    summary: "Fifty ready-made pitches, each behind a one-tap wa.me link. Send them at your own pace.",
    unitLabel: "links",
    batchSize: 50,
    popular: true,
    prices: [
      { market: "india", amount: 289, currency: "INR" },
      { market: "foreign", amount: 489, currency: "INR" },
    ],
    features: [
      "50 verified businesses with no website",
      "A custom sample site for each one",
      "A short demo recording per site",
      "One-tap links that open a pre-written chat",
    ],
  },
];

export function getPlan(id: PlanId): Plan {
  return plans.find((p) => p.id === id) ?? plans[0];
}

export function getPrice(plan: Plan, market: Market): PlanPrice {
  return plan.prices.find((p) => p.market === market) ?? plan.prices[0];
}

/** Demo coupons for the checkout preview. Move validation server-side when payments are wired. */
export const demoCoupons: Record<string, number> = {
  FIRSTPITCH: 0.2,
  LAUNCH50: 0.5,
};
