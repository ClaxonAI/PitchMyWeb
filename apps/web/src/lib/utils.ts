import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Shared className merge helper, used by both the marketing site's
// components/ui/* primitives and the dashboard's components/dashboard-ui/*
// primitives. Upgraded (Phase 1 dashboard rebuild) from a plain clsx wrapper
// to clsx+tailwind-merge so conflicting Tailwind utility classes passed
// together (e.g. a default padding class overridden by a caller's own) are
// resolved correctly — every existing call site's behavior is unchanged
// unless it was passing two classes for the same CSS property, in which
// case this fixes what would previously have been undefined cascade order.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Marketing site currency formatters (pricing page, home page price teasers
// — see components/home/*, components/pricing/*). USD prices in data/plans.ts
// are fractional dollar amounts (e.g. 1.4, 2.8), so USD always renders 2
// decimal places; INR conversions are large whole-rupee amounts, so INR
// rounds to the nearest rupee.
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

/** Formats a plan price in whichever currency it's actually priced in (data/plans.ts's `PlanPrice`). */
export function formatPrice({ amount, currency }: { amount: number; currency: string }): string {
  return currency === "INR" ? formatInr(amount) : formatMoney(amount, currency);
}
