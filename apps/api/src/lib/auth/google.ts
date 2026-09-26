import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, User } from "@pitchmyweb/db";
import { AccountSuspendedError, ConflictError, ValidationError } from "../errors";
import { claimOrder, claimPaidOrdersForUser } from "../checkout/checkout.service";
import { assertDeviceCanCreateAccount, claimTrialDevice } from "./trial-device";

export const GOOGLE_OAUTH_STATE_COOKIE = "pmw_google_oauth";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  appUrl: string;
};

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() || `${appUrl}/api/auth/google/callback`;

  return { clientId, clientSecret, redirectUri, appUrl };
}

export type GoogleOauthStatePayload = {
  nonce: string;
  orderId?: string;
  fingerprintId?: string;
};

export function createOauthState(orderId?: string | null, fingerprintId?: string | null): { raw: string; hash: string } {
  const payload: GoogleOauthStatePayload = {
    nonce: randomBytes(24).toString("hex"),
    ...(orderId ? { orderId } : {}),
    ...(fingerprintId ? { fingerprintId } : {}),
  };
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { raw, hash: hashOauthState(raw) };
}

export function hashOauthState(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function parseOauthState(raw: string): GoogleOauthStatePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GoogleOauthStatePayload;
    if (!parsed?.nonce || typeof parsed.nonce !== "string") return null;
    if (parsed.orderId !== undefined && typeof parsed.orderId !== "string") return null;
    if (parsed.fingerprintId !== undefined && typeof parsed.fingerprintId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizeUrl(config: GoogleOAuthConfig, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type UserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  error?: string;
};

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
): Promise<GoogleProfile> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenJson = (await tokenRes.json()) as TokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new ValidationError(tokenJson.error_description || tokenJson.error || "Google token exchange failed");
  }

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const info = (await infoRes.json()) as UserInfoResponse;
  if (!infoRes.ok || !info.sub || !info.email) {
    throw new ValidationError(info.error || "Google profile lookup failed");
  }
  if (!info.email_verified) {
    throw new ValidationError("Google email is not verified");
  }

  return {
    sub: info.sub,
    email: info.email.trim().toLowerCase(),
    emailVerified: true,
    ...(info.name ? { name: info.name } : {}),
    ...(info.picture ? { picture: info.picture } : {}),
  };
}

/**
 * Find-or-create a user from a verified Google profile, then optionally claim
 * a paid checkout order (same post-payment path as email register/login).
 */
export async function upsertGoogleUser(
  db: PrismaClient,
  profile: GoogleProfile,
  orderId?: string | null,
  fingerprintId?: string | null,
): Promise<User> {
  const byGoogle = await db.user.findUnique({ where: { googleId: profile.sub } });
  if (byGoogle) {
    if (byGoogle.suspendedAt) throw new AccountSuspendedError();
    const user = await db.user.update({
      where: { id: byGoogle.id },
      data: {
        lastLoginAt: new Date(),
        ...(profile.name && !byGoogle.name ? { name: profile.name } : {}),
        ...(profile.picture ? { imageUrl: profile.picture } : {}),
      },
    });
    if (orderId) await claimOrder(db, orderId, user.id);
    await claimPaidOrdersForUser(db, user.id, user.email, { emailVerified: true });
    await claimTrialDevice(db, user.id, fingerprintId ?? undefined);
    return user;
  }

  const byEmail = await db.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    if (byEmail.suspendedAt) throw new AccountSuspendedError();
    if (byEmail.googleId && byEmail.googleId !== profile.sub) {
      throw new ConflictError("This email is already linked to a different Google account");
    }
    const user = await db.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.sub,
        lastLoginAt: new Date(),
        ...(profile.name && !byEmail.name ? { name: profile.name } : {}),
        ...(profile.picture ? { imageUrl: profile.picture } : {}),
      },
    });
    if (orderId) await claimOrder(db, orderId, user.id);
    await claimPaidOrdersForUser(db, user.id, user.email, { emailVerified: true });
    await claimTrialDevice(db, user.id, fingerprintId ?? undefined);
    return user;
  }

  await assertDeviceCanCreateAccount(db, fingerprintId);

  const user = await db.user.create({
    data: {
      email: profile.email,
      googleId: profile.sub,
      passwordHash: null,
      name: profile.name ?? null,
      imageUrl: profile.picture ?? null,
      lastLoginAt: new Date(),
    },
  });
  if (orderId) await claimOrder(db, orderId, user.id);
  await claimPaidOrdersForUser(db, user.id, user.email, { emailVerified: true });
  await claimTrialDevice(db, user.id, fingerprintId ?? undefined);
  return user;
}
