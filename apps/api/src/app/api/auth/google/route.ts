import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  buildGoogleAuthorizeUrl,
  createOauthState,
  getGoogleOAuthConfig,
} from "../../../../lib/auth/google";
import { clientIp, rateLimit } from "../../../../lib/api/rate-limit";
import { errorResponse } from "../../../../lib/api/response";
import { ValidationError } from "../../../../lib/errors";

const STATE_TTL_MS = 10 * 60 * 1000;

export async function handleGoogleStart(request: NextRequest): Promise<NextResponse> {
  await rateLimit(`google-oauth:ip:${clientIp(request)}`, 30, 15 * 60 * 1000);

  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new ValidationError(
      "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }

  const orderId = request.nextUrl.searchParams.get("orderId");
  const fingerprintId = request.nextUrl.searchParams.get("fingerprintId");
  const { raw, hash } = createOauthState(orderId, fingerprintId);
  const authorizeUrl = buildGoogleAuthorizeUrl(config, raw);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(STATE_TTL_MS / 1000),
  });
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleGoogleStart(request);
  } catch (error) {
    return errorResponse(error);
  }
}
