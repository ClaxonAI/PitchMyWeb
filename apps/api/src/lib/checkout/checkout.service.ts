import type { Order, Prisma, PrismaClient } from "@pitchmyweb/db";
import type { CreateOrderInput, VerifyPaymentInput } from "../validation/checkout";
import type { RazorpayClient } from "./razorpay-client";
import { computeOrderAmount, computeOrderAmountWithDiscount, creditsForPlan } from "./plan-pricing";
import { verifyRazorpaySignature } from "./razorpay-signature";
import { grantCredits } from "./wallet.service";
import { NotFoundError, PaymentConfigurationError, PaymentVerificationError, ValidationError } from "../errors";

type Db = PrismaClient | Prisma.TransactionClient;

// Razorpay's own minimum order amount (100 in the smallest currency unit —
// $1.00 for USD, ₹1 for INR). A plan price is always well above this, but a
// coupon can discount it below the floor, which Razorpay would otherwise
// reject with a less legible error at order-creation time.
const MIN_AMOUNT_CENTS = 100;

async function computeDbOrderAmount(db: Db, input: CreateOrderInput) {
  if (!input.couponCode) return computeOrderAmount(input.planId, input.market);
  const coupon = await db.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
  const valid = coupon?.active && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxRedemptions || coupon.redemptionCount < coupon.maxRedemptions);
  if (!valid) return computeOrderAmount(input.planId, input.market);
  return computeOrderAmountWithDiscount(input.planId, input.market, coupon.discountPercent / 100);
}

async function redeemCoupon(db: Db, code: string | null): Promise<void> {
  if (!code) return;
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt <= new Date())) return;
  const where = coupon.maxRedemptions
    ? { id: coupon.id, redemptionCount: { lt: coupon.maxRedemptions } }
    : { id: coupon.id };
  await db.coupon.updateMany({ where, data: { redemptionCount: { increment: 1 } } });
}

export type CreatedOrder = {
  /** Our local Order.id, not Razorpay's — this is what verify/claim key off. */
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  dummy?: boolean;
};

type Env = Record<string, string | undefined>;

/**
 * Dummy checkout until Razorpay is switched on with PAYMENT_GATEWAY=razorpay.
 *
 * Never in production: a dummy order is PAID without any payment and grants
 * credits, so a production server with the setting missing or mistyped would
 * be giving credits away. There it throws instead, which the checkout route
 * turns into a 503 ("payments are not configured").
 */
export function isDummyPaymentGateway(env: Env = process.env): boolean {
  const raw = (env.PAYMENT_GATEWAY ?? "dummy").trim().toLowerCase();
  if (raw === "razorpay") return false;
  if (env.APP_ENV?.trim().toLowerCase() === "production") {
    throw new PaymentConfigurationError("Payments are not configured on this server (PAYMENT_GATEWAY must be razorpay in production).");
  }
  return true;
}

/**
 * Creates a PENDING Order and a matching Razorpay order. The amount charged
 * is always recomputed here from planId/market/couponCode — never trusted
 * from the client (see plan-pricing.ts's header comment).
 */
export async function createOrder(db: Db, razorpay: RazorpayClient, input: CreateOrderInput): Promise<CreatedOrder> {
  const { totalCents, currency } = await computeDbOrderAmount(db, input);
  if (totalCents < MIN_AMOUNT_CENTS) {
    throw new ValidationError(`Order amount is below the minimum payable amount (${MIN_AMOUNT_CENTS} cents)`);
  }

  // Created PENDING first so the Razorpay order's `receipt` can reference a
  // real local id, and so a Razorpay failure after this point still leaves
  // a traceable (if permanently PENDING) row rather than nothing at all.
  const order = await db.order.create({
    data: {
      planId: input.planId,
      market: input.market,
      countryCode: input.countryCode ?? null,
      couponCode: input.couponCode ?? null,
      amount: totalCents,
      currency,
      // Frozen at creation from plan-pricing.ts, same as amount — a later
      // change to a plan's pack size must never retroactively change what
      // an already-placed order pays out once claimed.
      credits: creditsForPlan(input.planId, input.market),
      status: "PENDING",
      // Placeholder until the Razorpay call below returns; @unique on this
      // column means two concurrent creates can never collide on it.
      razorpayOrderId: `pending_${cryptoRandomSuffix()}`,
    },
  });

  const razorpayOrder = await razorpay.createOrder({ amount: totalCents, currency, receipt: order.id });

  const updated = await db.order.update({
    where: { id: order.id },
    data: { razorpayOrderId: razorpayOrder.id },
  });

  return { orderId: updated.id, razorpayOrderId: razorpayOrder.id, amount: totalCents, currency };
}

/**
 * One-click local checkout: persist a PAID order with no card network.
 * Used when PAYMENT_GATEWAY is dummy (the default). Same plan/amount
 * math as createOrder; the row is already claimable.
 */
export async function createDummyPaidOrder(db: Db, input: CreateOrderInput): Promise<CreatedOrder> {
  const { totalCents, currency } = await computeDbOrderAmount(db, input);
  const suffix = cryptoRandomSuffix();
  const order = await db.order.create({
    data: {
      planId: input.planId,
      market: input.market,
      countryCode: input.countryCode ?? null,
      couponCode: input.couponCode ?? null,
      amount: totalCents,
      currency,
      credits: creditsForPlan(input.planId, input.market),
      status: "PAID",
      razorpayOrderId: `dummy_${suffix}`,
      razorpayPaymentId: `dummy_pay_${suffix}`,
      razorpaySignature: "dummy",
    },
  });
  await redeemCoupon(db, input.couponCode ?? null);
  return { orderId: order.id, razorpayOrderId: order.razorpayOrderId, amount: totalCents, currency, dummy: true };
}

function cryptoRandomSuffix(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Verifies a completed Razorpay Standard Checkout callback against the
 * order it claims to pay for. Idempotent: re-verifying an already-PAID
 * order just returns it (a client retry after a dropped response must not
 * fail or re-derive a second signature check). Any mismatch marks the order
 * FAILED and throws — it is never marked PAID from anything other than a
 * signature this function itself recomputed and matched.
 */
export async function verifyPayment(db: Db, keySecret: string, input: VerifyPaymentInput): Promise<Order> {
  const order = await db.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new NotFoundError("Order", input.orderId);

  if (order.status === "PAID") return order;

  const signatureValid = verifyRazorpaySignature(keySecret, order.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature);

  if (!signatureValid) {
    await db.order.update({
      where: { id: order.id },
      data: { status: "FAILED", razorpayPaymentId: input.razorpayPaymentId, razorpaySignature: input.razorpaySignature },
    });
    throw new PaymentVerificationError();
  }

  const paidOrder = await db.order.update({
    where: { id: order.id },
    data: { status: "PAID", razorpayPaymentId: input.razorpayPaymentId, razorpaySignature: input.razorpaySignature },
  });
  await redeemCoupon(db, order.couponCode);
  return paidOrder;
}

/**
 * Attaches a PAID, unclaimed order to a newly-registered or newly-logged-in
 * user. Called from the register/login route handlers with whatever
 * `orderId` a post-payment redirect carried in the URL — best-effort by
 * design: a missing, already-claimed, or not-yet-PAID order is silently a
 * no-op (updateMany matches zero rows) rather than failing the
 * registration/login it's attached to, since an unrelated or stale orderId
 * in the query string is not the caller's fault.
 */
export async function claimOrder(db: Db, orderId: string, userId: string): Promise<void> {
  const result = await db.order.updateMany({
    where: { id: orderId, userId: null, status: "PAID" },
    data: { userId },
  });
  if (result.count !== 1) return;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  // planId is kept on the user record for display/admin purposes only — it
  // no longer grants unlimited access on its own (see paid-access.ts). The
  // credits this specific order paid for are what actually unlocks pitching,
  // granted idempotently keyed on the order id: a retried/duplicated claim
  // (e.g. this route called twice with the same orderId) grants once.
  await db.user.update({ where: { id: userId }, data: { planId: order.planId } });
  await grantCredits(db, { userId, amount: order.credits, type: "PURCHASE", orderId: order.id, referenceId: `purchase:${order.id}` });
}

/**
 * Attaches unclaimed PAID orders paid with this email, then (re)grants every
 * PAID order the user owns.
 *
 * The email match only runs when the provider has verified the address
 * (Google, Clerk). An email-and-password account's address was never
 * checked, so matching on it would let anyone register with someone else's
 * email and collect the credits they paid for.
 */
export async function claimPaidOrdersForUser(db: Db, userId: string, email: string, options: { emailVerified: boolean }): Promise<void> {
  if (options.emailVerified) {
    await db.order.updateMany({
      where: { userId: null, payerEmail: email.trim().toLowerCase(), status: "PAID" },
      data: { userId },
    });
  }
  // Every PAID order this user now owns — both orders claimed just above and
  // any claimed by an earlier call — not only the newest. grantCredits is
  // idempotent per order id, so re-granting an already-credited order here
  // is always a safe no-op; this is what makes it safe to call this sweep
  // more than once for the same user (login, then a later login) without a
  // second credit grant for the same purchase.
  const orders = await db.order.findMany({ where: { userId, status: "PAID" }, orderBy: { createdAt: "desc" } });
  if (orders.length === 0) return;
  await db.user.update({ where: { id: userId }, data: { planId: orders[0]!.planId } });
  for (const order of orders) {
    await grantCredits(db, { userId, amount: order.credits, type: "PURCHASE", orderId: order.id, referenceId: `purchase:${order.id}` });
  }
}
