import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { verifyPaymentSchema } from "../../../../lib/validation/checkout";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { claimOrder, verifyPayment } from "../../../../lib/checkout/checkout.service";
import { PaymentConfigurationError } from "../../../../lib/errors";
import { clientIp, rateLimit } from "../../../../lib/api/rate-limit";

// POST /api/checkout/verify — public (no session, same reasoning as
// create-order). `keySecret` is injectable for tests (never a real
// Razorpay call here — this endpoint only does local HMAC math), defaults
// to the env-configured secret in production.
export async function handleVerifyPayment(db: PrismaClient, request: NextRequest, keySecret?: string): Promise<NextResponse> {
  // Rate limited by IP: this endpoint accepts a client-claimed signature, and
  // while a forged signature can't pass the HMAC check, this still bounds
  // how many attempts a single source gets to try.
  await rateLimit(`checkout-verify:ip:${clientIp(request)}`, 30, 60 * 60 * 1000);

  const body = await parseJsonBody(request, verifyPaymentSchema);

  const secret = keySecret ?? process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new PaymentConfigurationError("Payments are not configured: RAZORPAY_KEY_SECRET must be set.");
  }

  const order = await verifyPayment(db, secret, body);
  const user = await getCurrentUser(db, request);
  if (user && order.status === "PAID") {
    await claimOrder(db, order.id, user.id);
  }
  return jsonOk({ orderId: order.id, status: order.status, claimed: Boolean(user) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleVerifyPayment(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
