import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@pitchmyweb/db";
import { PaymentConfigurationError, PaymentVerificationError, ValidationError } from "../errors";

type PaymentLinkPlan = { planId: "auto" | "direct"; market: "india" | "foreign"; amount: number; currency: "INR" };

const PAYMENT_LINK_PLANS: Record<string, PaymentLinkPlan> = {
  "tKFDSNi": { planId: "auto", market: "india", amount: 14900, currency: "INR" },
  "5U4CHLK": { planId: "direct", market: "india", amount: 28900, currency: "INR" },
  "4i6QO9N": { planId: "auto", market: "foreign", amount: 32900, currency: "INR" },
  "LxT7CIM4": { planId: "direct", market: "foreign", amount: 48900, currency: "INR" },
};

type PaymentLinkWebhook = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; short_url?: string; amount?: number; amount_paid?: number; currency?: string; customer?: { email?: string } } };
    payment?: { entity?: { id?: string; payment_link_id?: string; amount?: number; currency?: string; email?: string } };
  };
};

export function verifyPaymentLinkWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function parsePaymentLinkWebhook(body: string): { paymentLinkId: string; paymentId: string; email: string | null; plan: PaymentLinkPlan; currency: string } {
  let event: PaymentLinkWebhook;
  try {
    event = JSON.parse(body) as PaymentLinkWebhook;
  } catch {
    throw new ValidationError("Invalid Razorpay webhook payload");
  }

  if (event.event !== "payment_link.paid") throw new ValidationError("Unsupported Razorpay webhook event");
  const link = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  const paymentLinkId = link?.id ?? payment?.payment_link_id;
  const paymentId = payment?.id;
  const amount = link?.amount_paid ?? link?.amount ?? payment?.amount;
  const currency = link?.currency ?? payment?.currency;
  if (!paymentLinkId || !paymentId || !amount || !currency) throw new ValidationError("Incomplete Razorpay payment-link payload");

  const shortCode = link?.short_url?.split("/").pop();
  const plan = PAYMENT_LINK_PLANS[paymentLinkId.replace(/^plink_/, "")] ?? (shortCode ? PAYMENT_LINK_PLANS[shortCode] : undefined);
  if (!plan || currency !== plan.currency || amount !== plan.amount) throw new ValidationError("Unknown Razorpay payment-link");

  return {
    paymentLinkId,
    paymentId,
    email: link?.customer?.email ?? payment?.email ?? null,
    plan,
    currency: plan.currency,
  };
}

export async function handlePaymentLinkWebhook(db: PrismaClient, body: string, signature: string | null, webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET): Promise<void> {
  if (!webhookSecret) throw new PaymentConfigurationError("Payments are not configured: RAZORPAY_WEBHOOK_SECRET must be set.");
  if (!signature || !verifyPaymentLinkWebhookSignature(body, signature, webhookSecret)) throw new PaymentVerificationError("Invalid Razorpay webhook signature");

  const payment = parsePaymentLinkWebhook(body);
  // Payment Links can be paid more than once. Key each local order by the
  // unique payment event, so a repeated webhook is idempotent without
  // overwriting a later legitimate purchase of the same link.
  const razorpayOrderId = `payment_link_${payment.paymentId}`;
  const user = payment.email
    ? await db.user.findUnique({ where: { email: payment.email.trim().toLowerCase() }, select: { id: true } })
    : null;

  await db.order.upsert({
    where: { razorpayOrderId },
    create: {
      userId: user?.id ?? null,
      planId: payment.plan.planId,
      market: payment.plan.market,
      payerEmail: payment.email?.trim().toLowerCase() ?? null,
      amount: payment.plan.amount,
      currency: payment.currency,
      status: "PAID",
      razorpayOrderId,
      razorpayPaymentId: payment.paymentId,
      razorpaySignature: signature,
    },
    update: {
      userId: user?.id ?? undefined,
      status: "PAID",
      razorpayPaymentId: payment.paymentId,
      razorpaySignature: signature,
    },
  });
}