import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { clientIp, rateLimit } from "../../../../../lib/api/rate-limit";
import { runAfterResponse, type DeferTask } from "../../../../../lib/api/after-response";
import { passwordResetCompleteSchema } from "../../../../../lib/validation/auth";
import { completePasswordReset } from "../../../../../lib/auth/password-reset";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { sendPasswordChangedEmail } from "../../../../../lib/email/password-reset-mail";

// POST /api/auth/password-reset/complete {resetToken, password}. Sets the
// password, ends every existing session, signs this browser in, and emails
// the account a notice that the password changed.
export async function handlePasswordResetComplete(db: PrismaClient, request: NextRequest, defer: DeferTask = runAfterResponse): Promise<NextResponse> {
  await rateLimit(`password-reset-complete:ip:${clientIp(request)}`, 20, 15 * 60 * 1000);
  const { resetToken, password } = await parseJsonBody(request, passwordResetCompleteSchema);
  const user = await completePasswordReset(db, resetToken, password);
  defer(() => sendPasswordChangedEmail(user.email, user.id));

  const session = await createSession(db, user.id);
  const response = jsonOk({ email: user.email });
  response.cookies.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handlePasswordResetComplete(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
