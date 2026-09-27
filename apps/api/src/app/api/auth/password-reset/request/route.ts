import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { clientIp, rateLimit } from "../../../../../lib/api/rate-limit";
import { runAfterResponse, type DeferTask } from "../../../../../lib/api/after-response";
import { passwordResetRequestSchema } from "../../../../../lib/validation/auth";
import { createResetCode } from "../../../../../lib/auth/password-reset";
import { sendResetCodeEmail } from "../../../../../lib/email/password-reset-mail";

const WINDOW_MS = 60 * 60 * 1000;

// POST /api/auth/password-reset/request {email}. The same 200 whether or not
// the address has an account, and the email goes out after the response, so
// neither the answer nor its timing says who is registered.
export async function handlePasswordResetRequest(db: PrismaClient, request: NextRequest, defer: DeferTask = runAfterResponse): Promise<NextResponse> {
  await rateLimit(`password-reset-request:ip:${clientIp(request)}`, 10, WINDOW_MS);
  const { email } = await parseJsonBody(request, passwordResetRequestSchema);
  // Per address too, so one inbox can't be flooded from many IPs.
  await rateLimit(`password-reset-request:email:${createHash("sha256").update(email).digest("hex")}`, 5, WINDOW_MS);

  const result = await createResetCode(db, email);
  if (result.status === "sent") defer(() => sendResetCodeEmail(email, result.code, result.userId));
  return jsonOk({ ok: true });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handlePasswordResetRequest(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
