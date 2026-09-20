import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { handlePaymentLinkWebhook } from "../../../../lib/checkout/payment-link-webhook";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    await handlePaymentLinkWebhook(prisma, body, request.headers.get("x-razorpay-signature"));
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Razorpay webhook rejected:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Webhook rejected" }, { status: 400 });
  }
}