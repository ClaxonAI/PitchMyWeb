import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay Standard Checkout's own signature scheme (fixed by Razorpay, not
// a PitchMyWeb convention like lib/webhooks/signature.ts's): the checkout
// handler returns razorpay_order_id, razorpay_payment_id and
// razorpay_signature, and a payment only counts as verified if
// HMAC-SHA256(`${order_id}|${payment_id}`, key_secret) matches the returned
// signature exactly.

export function computeRazorpaySignature(keySecret: string, razorpayOrderId: string, razorpayPaymentId: string): string {
  return createHmac("sha256", keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
}

/** Timing-safe compare — matches lib/webhooks/signature.ts's safeEqual. */
export function verifyRazorpaySignature(keySecret: string, razorpayOrderId: string, razorpayPaymentId: string, providedSignature: string): boolean {
  const expected = Buffer.from(computeRazorpaySignature(keySecret, razorpayOrderId, razorpayPaymentId));
  const actual = Buffer.from(providedSignature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
