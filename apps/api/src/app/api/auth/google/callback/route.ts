import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  exchangeGoogleCode,
  getGoogleOAuthConfig,
  hashOauthState,
  parseOauthState,
  upsertGoogleUser,
} from "../../../../../lib/auth/google";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { clientIp, rateLimit } from "../../../../../lib/api/rate-limit";
import { errorResponse } from "../../../../../lib/api/response";
import { DomainError, UnauthenticatedError, ValidationError } from "../../../../../lib/errors";

function redirectToApp(appUrl: string, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, `${appUrl}/`));
}

export async function handleGoogleCallback(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await rateLimit(`google-oauth-callback:ip:${clientIp(request)}`, 30, 15 * 60 * 1000);

  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new ValidationError("Google sign-in is not configured");
  }

  const url = request.nextUrl;
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return redirectToApp(config.appUrl, `/login?error=google_denied`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateHash = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !stateHash || hashOauthState(state) !== stateHash) {
    throw new UnauthenticatedError();
  }

  const payload = parseOauthState(state);
  if (!payload) throw new UnauthenticatedError();

  const profile = await exchangeGoogleCode(config, code);
  const user = await upsertGoogleUser(db, profile, payload.orderId, payload.fingerprintId);
  const session = await createSession(db, user.id);

  const response = redirectToApp(config.appUrl, "/dashboard");
  response.cookies.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleGoogleCallback(prisma, request);
  } catch (error) {
    const config = getGoogleOAuthConfig();
    const appUrl = config?.appUrl ?? (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    if (error instanceof DomainError && error.code === "ACCOUNT_SUSPENDED") {
      return NextResponse.redirect(new URL("/login?error=suspended", `${appUrl}/`));
    }
    if (error instanceof DomainError) {
      return NextResponse.redirect(new URL(`/login?error=google`, `${appUrl}/`));
    }
    return errorResponse(error);
  }
}
