import { describe, expect, it } from "vitest";
import { computeOrderAmount } from "./plan-pricing";
import { ValidationError } from "../errors";

describe("computeOrderAmount", () => {
  it("prices the auto plan in INR for both markets", () => {
    expect(computeOrderAmount("auto", "india")).toEqual({ subtotalCents: 14900, discountCents: 0, totalCents: 14900, currency: "INR" });
    expect(computeOrderAmount("auto", "foreign")).toEqual({ subtotalCents: 32900, discountCents: 0, totalCents: 32900, currency: "INR" });
  });

  it("prices the direct plan in INR for both markets", () => {
    expect(computeOrderAmount("direct", "india")).toEqual({ subtotalCents: 28900, discountCents: 0, totalCents: 28900, currency: "INR" });
    expect(computeOrderAmount("direct", "foreign")).toEqual({ subtotalCents: 48900, discountCents: 0, totalCents: 48900, currency: "INR" });
  });

  it("applies a known coupon's discount rate, case-insensitively", () => {
    const withCoupon = computeOrderAmount("direct", "india", "firstpitch");
    expect(withCoupon).toEqual({ subtotalCents: 28900, discountCents: 5780, totalCents: 23120, currency: "INR" });

    const halfOff = computeOrderAmount("direct", "india", "LAUNCH50");
    expect(halfOff).toEqual({ subtotalCents: 28900, discountCents: 14450, totalCents: 14450, currency: "INR" });
  });

  it("ignores an unknown coupon code rather than rejecting the order", () => {
    expect(computeOrderAmount("auto", "india", "NOT-A-REAL-CODE")).toEqual({
      subtotalCents: 14900,
      discountCents: 0,
      totalCents: 14900,
      currency: "INR",
    });
  });

  it("throws ValidationError for an unrecognized planId", () => {
    // @ts-expect-error deliberately invalid input, same as an unvalidated caller would pass
    expect(() => computeOrderAmount("enterprise", "india")).toThrow(ValidationError);
  });

  it("throws ValidationError for an unrecognized market", () => {
    // @ts-expect-error deliberately invalid input
    expect(() => computeOrderAmount("auto", "moon")).toThrow(ValidationError);
  });
});
