import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { markOrderPaidFromWebhook } from "../../../../lib/checkout/checkout.service";

// POST /api/checkout/webhook — Razorpay's server-to-server payment events.
//
// Registered in the Razorpay dashboard (Settings → Webhooks) for
// payment.captured and order.paid, with RAZORPAY_WEBHOOK_SECRET as its secret.
// Razorpay signs the raw body: X-Razorpay-Signature =
// HMAC-SHA256(body, webhook secret). Anything unsigned or mis-signed is
// refused; a well-signed event this route does not act on still gets 200 so
// Razorpay stops retrying it.

const HANDLED = new Set(["payment.captured", "order.paid"]);

type RazorpayEvent = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; email?: string | null; status?: string } } };
};

export function webhookSignatureValid(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function handleRazorpayWebhook(db: PrismaClient, request: NextRequest, secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim()): Promise<NextResponse> {
  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set: Razorpay payment webhooks are refused.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const rawBody = await request.text();
  if (!webhookSignatureValid(secret, rawBody, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!event.event || !HANDLED.has(event.event)) return NextResponse.json({ ignored: true });

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id || payment.status !== "captured") return NextResponse.json({ ignored: true });

  const outcome = await markOrderPaidFromWebhook(db, {
    razorpayOrderId: payment.order_id,
    razorpayPaymentId: payment.id,
    payerEmail: payment.email ?? null,
  });
  console.info(JSON.stringify({ event: "checkout.webhook", type: event.event, outcome }));
  return NextResponse.json({ outcome });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleRazorpayWebhook(prisma, request);
  } catch (error) {
    // 500 makes Razorpay retry, which is what an unexpected failure needs.
    console.error("Razorpay webhook failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
