import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { clientIp, rateLimit } from "../../../../../lib/api/rate-limit";
import { passwordResetVerifySchema } from "../../../../../lib/validation/auth";
import { verifyResetCode } from "../../../../../lib/auth/password-reset";

// POST /api/auth/password-reset/verify {email, code} -> {resetToken}. Each
// code already allows only 5 tries; the per-IP limit stops one caller
// cycling through fresh codes for many addresses.
export async function handlePasswordResetVerify(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await rateLimit(`password-reset-verify:ip:${clientIp(request)}`, 30, 15 * 60 * 1000);
  const { email, code } = await parseJsonBody(request, passwordResetVerifySchema);
  return jsonOk(await verifyResetCode(db, email, code));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handlePasswordResetVerify(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
