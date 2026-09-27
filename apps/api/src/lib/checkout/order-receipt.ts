import type { PrismaClient } from "@pitchmyweb/db";
import { readEmailConfig } from "../email/config";
import { reportEmailSkipped, sendEmail, type SendEmailDeps } from "../email/email.service";
import { renderPaymentReceipt } from "../email/templates/payment-receipt";

// The payment confirmation email, sent once per paid order.
//
// Triggered after a payment is confirmed server-side — /api/checkout/verify
// (signature recomputed) or /api/checkout/webhook (signed by Razorpay) —
// never by the browser's say-so. Both usually arrive for the same payment,
// and Razorpay sends payment.captured and order.paid besides, so the send is
// claimed first: receiptEmailSentAt is set with a conditional update, and
// only the caller that set it sends. A failed send clears it again, so the
// next confirmation retries; Resend's idempotency key (the order id) keeps a
// send that did go through but looked failed from going out twice.
//
// Recipient: the account the order belongs to, else the signed-in buyer who
// started checkout, else the email the payer gave Razorpay. None of those
// known yet (a guest's browser confirming before the webhook brings the
// payer's email): nothing is claimed, and the webhook sends it.

export type ReceiptOutcome =
  | "sent"
  | "already_sent"
  | "not_found"
  | "not_paid"
  | "dummy_order"
  | "no_recipient"
  | "not_configured"
  | "failed";

const PLAN_NAMES: Record<string, string> = { auto: "Auto", direct: "Direct" }; // apps/web/src/data/plans.ts

export type OrderReceiptDeps = SendEmailDeps & { env?: Record<string, string | undefined> };

export async function sendOrderReceipt(
  db: PrismaClient,
  where: { id: string } | { razorpayOrderId: string },
  deps: OrderReceiptDeps = {},
): Promise<ReceiptOutcome> {
  const env = deps.env ?? process.env;
  // Checked before touching the database, so an environment without email
  // (development, the test suite) costs nothing here.
  const config = deps.config ?? readEmailConfig(env);
  if (!config.ok) {
    reportEmailSkipped("payment_receipt", config.reason, { referenceId: "id" in where ? where.id : where.razorpayOrderId });
    return "not_configured";
  }

  const order = await db.order.findUnique({ where, include: { user: { select: { email: true } } } });
  if (!order) return "not_found";
  if (order.status !== "PAID") return "not_paid";
  // Local one-click checkout (PAYMENT_GATEWAY=dummy): nothing was charged.
  if (order.razorpayOrderId.startsWith("dummy_")) return "dummy_order";
  if (order.receiptEmailSentAt) return "already_sent";

  let recipient = order.user?.email ?? null;
  if (!recipient && order.buyerId) {
    recipient = (await db.user.findUnique({ where: { id: order.buyerId }, select: { email: true } }))?.email ?? null;
  }
  recipient ??= order.payerEmail;
  if (!recipient) return "no_recipient";

  const claimed = await db.order.updateMany({ where: { id: order.id, receiptEmailSentAt: null }, data: { receiptEmailSentAt: new Date() } });
  if (claimed.count === 0) return "already_sent";

  const content = renderPaymentReceipt({
    recipientEmail: recipient,
    amountMinor: order.amount,
    currency: order.currency,
    planName: PLAN_NAMES[order.planId] ?? order.planId,
    credits: order.credits,
    orderId: order.id,
    paymentId: order.razorpayPaymentId,
    claimed: Boolean(order.userId),
    appUrl: env.APP_URL?.trim() || "https://pitchmyweb.in",
    replyTo: config.config.replyTo,
  });
  const result = await sendEmail(
    { to: recipient, category: "payment_receipt", content, idempotencyKey: `order-receipt/${order.id}`, referenceId: order.id, userId: order.userId },
    { ...deps, config },
  );

  if (result.status === "sent") {
    await db.order.update({ where: { id: order.id }, data: { receiptEmailId: result.id } });
    return "sent";
  }
  // Release the claim so the next confirmation of this payment tries again.
  await db.order.updateMany({ where: { id: order.id, receiptEmailId: null }, data: { receiptEmailSentAt: null } });
  return "failed";
}
