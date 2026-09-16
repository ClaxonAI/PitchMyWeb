import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../../generated/prisma/client";
import { prisma } from "../../../../lib/db/client";
import { hashPassword } from "../../../../lib/auth/password";
import { SESSION_COOKIE_NAME, createSession } from "../../../../lib/auth/session";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { ConflictError, isUniqueConstraintViolation } from "../../../../lib/errors";
import { registerSchema } from "../../../../lib/validation/auth";
import { clientIp, enforceRateLimit } from "../../../../lib/api/rate-limit";

// Not one of the 8 endpoints listed in this phase's scope, but a direct
// prerequisite of every other one: section 4 requires every user-owned
// endpoint to authenticate the current user, and no auth mechanism existed
// in the repository at all before this phase (see the Phase 4 report).
// Registration/login/logout are the minimum surface needed to obtain and
// test a real session.
export async function handleRegister(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  // Phase 4 code-review finding #12: bounds registration spam from a single
  // source (bcrypt hashing is itself CPU-expensive, so this also protects
  // against a cheap resource-exhaustion attempt).
  enforceRateLimit(`register:ip:${clientIp(request)}`, 10, 60 * 60 * 1000);

  const body = await parseJsonBody(request, registerSchema);
  const passwordHash = await hashPassword(body.password);

  let user;
  try {
    user = await db.user.create({ data: { email: body.email, passwordHash } });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError("Email is already registered");
    }
    throw error;
  }

  const session = await createSession(db, user.id);
  const response = jsonOk({ id: user.id, email: user.email }, 201);
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
    return await handleRegister(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
