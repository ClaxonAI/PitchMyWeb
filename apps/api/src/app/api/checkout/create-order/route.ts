import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { createOrderSchema } from "../../../../lib/validation/checkout";
import { claimOrder, createDummyPaidOrder, createOrder, isDummyPaymentGateway } from "../../../../lib/checkout/checkout.service";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { createRazorpayClientFromEnv, type RazorpayClient } from "../../../../lib/checkout/razorpay-client";
import { clientIp, rateLimit } from "../../../../lib/api/rate-limit";

// POST /api/checkout/create-order — public (no session): /pricing has no
// account to attach a purchase to yet (see checkout.service.ts's header
// comment on anonymous orders). `razorpay` is injectable the same way
// `ai`/`provider` are elsewhere in this codebase (section 17): tests
// pass a fake RazorpayClient, production resolves the real env-configured
// one, lazily, so a missing key surfaces as a normal caught 503.
export async function handleCreateOrder(db: PrismaClient, request: NextRequest, razorpay?: RazorpayClient): Promise<NextResponse> {
  // Public + creates an upstream Razorpay order per call, so this is rate
  // limited by IP the same way register/login are.
  await rateLimit(`checkout-create:ip:${clientIp(request)}`, 20, 60 * 60 * 1000);

  const body = await parseJsonBody(request, createOrderSchema);

  if (!razorpay && isDummyPaymentGateway()) {
    const result = await createDummyPaidOrder(db, body);
    const user = await getCurrentUser(db, request);
    if (user) await claimOrder(db, result.orderId, user.id);
    return jsonOk({
      orderId: result.orderId,
      razorpayOrderId: result.razorpayOrderId,
      amount: result.amount,
      currency: result.currency,
      dummy: true,
      status: "PAID" as const,
      claimed: Boolean(user),
      keyId: "dummy",
    });
  }

  const result = await createOrder(db, razorpay ?? createRazorpayClientFromEnv(), body);

  return jsonOk({
    orderId: result.orderId,
    razorpayOrderId: result.razorpayOrderId,
    amount: result.amount,
    currency: result.currency,
    dummy: false,
    // Safe to return: the Key ID is the public half of the Razorpay
    // credential pair, meant to be used client-side to open Checkout.
    // Never the Key Secret.
    keyId: process.env.RAZORPAY_KEY_ID,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCreateOrder(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
