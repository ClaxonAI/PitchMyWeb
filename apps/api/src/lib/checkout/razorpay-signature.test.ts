import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeRazorpaySignature, verifyRazorpaySignature } from "./razorpay-signature";

describe("computeRazorpaySignature", () => {
  it("matches Razorpay's own documented scheme: HMAC-SHA256(order_id|payment_id, key_secret)", () => {
    const expected = createHmac("sha256", "test_secret").update("order_abc|pay_xyz").digest("hex");
    expect(computeRazorpaySignature("test_secret", "order_abc", "pay_xyz")).toBe(expected);
  });
});

describe("verifyRazorpaySignature", () => {
  it("accepts a correctly-computed signature", () => {
    const signature = computeRazorpaySignature("test_secret", "order_abc", "pay_xyz");
    expect(verifyRazorpaySignature("test_secret", "order_abc", "pay_xyz", signature)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = computeRazorpaySignature("wrong_secret", "order_abc", "pay_xyz");
    expect(verifyRazorpaySignature("test_secret", "order_abc", "pay_xyz", signature)).toBe(false);
  });

  it("rejects a signature for a different order/payment id pair", () => {
    const signature = computeRazorpaySignature("test_secret", "order_abc", "pay_xyz");
    expect(verifyRazorpaySignature("test_secret", "order_other", "pay_xyz", signature)).toBe(false);
    expect(verifyRazorpaySignature("test_secret", "order_abc", "pay_other", signature)).toBe(false);
  });

  it("rejects a signature of a different length without throwing", () => {
    expect(verifyRazorpaySignature("test_secret", "order_abc", "pay_xyz", "short")).toBe(false);
  });
});
