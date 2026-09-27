import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { findValidCoupon } from "../../../../lib/checkout/checkout.service";
import { clientIp, rateLimit } from "../../../../lib/api/rate-limit";
import { NotFoundError } from "../../../../lib/errors";

// GET /api/checkout/coupon?code=… — public, for the pricing page's "Have a
// coupon?" field: the discount to show, from the same rule create-order
// charges by. Rate limited per IP so codes can't be guessed by brute force.
export async function handleCheckCoupon(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await rateLimit(`checkout-coupon:ip:${clientIp(request)}`, 20, 15 * 60 * 1000);
  const code = request.nextUrl.searchParams.get("code")?.slice(0, 64) ?? "";
  const coupon = await findValidCoupon(db, code);
  if (!coupon) throw new NotFoundError("Coupon", code.trim().toUpperCase());
  return jsonOk(coupon);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCheckCoupon(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
