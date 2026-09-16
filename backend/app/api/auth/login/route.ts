import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../../generated/prisma/client";
import { prisma } from "../../../../lib/db/client";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "../../../../lib/auth/password";
import { SESSION_COOKIE_NAME, createSession } from "../../../../lib/auth/session";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { UnauthenticatedError } from "../../../../lib/errors";
import { loginSchema } from "../../../../lib/validation/auth";
import { clientIp, enforceRateLimit } from "../../../../lib/api/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

export async function handleLogin(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const body = await parseJsonBody(request, loginSchema);

  // Two independent limits (Phase 4 code-review finding #12): one caps
  // attempts against a single account regardless of source IP (protects
  // against distributed credential stuffing), the other caps attempts from
  // a single source regardless of target email (protects against one
  // client hammering many accounts). Checked before the DB lookup/bcrypt
  // work so a limited caller doesn't get a "free" expensive request either.
  enforceRateLimit(`login:email:${body.email}`, 10, WINDOW_MS);
  enforceRateLimit(`login:ip:${clientIp(request)}`, 20, WINDOW_MS);

  const user = await db.user.findUnique({ where: { email: body.email } });
  // Same generic failure for "no such user" and "wrong password" — do not
  // let a login attempt be used to enumerate registered emails. Critically,
  // verifyPassword() runs unconditionally, against the real user's hash if
  // one exists or DUMMY_PASSWORD_HASH otherwise, so both cases pay the same
  // bcrypt.compare() cost and are not distinguishable by response timing
  // (Phase 4 code-review finding #2).
  const passwordMatches = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    throw new UnauthenticatedError();
  }

  const session = await createSession(db, user.id);
  const response = jsonOk({ id: user.id, email: user.email });
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
    return await handleLogin(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
