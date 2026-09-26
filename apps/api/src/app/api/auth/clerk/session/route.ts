import { createClerkClient, verifyToken } from "@clerk/backend";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { claimOrder, claimPaidOrdersForUser } from "../../../../../lib/checkout/checkout.service";
import { assertDeviceCanCreateAccount, claimTrialDevice, DeviceAccountLimitError } from "../../../../../lib/auth/trial-device";

// The browser's FingerprintJS visitor id, sent by apps/web's
// exchangeClerkSession so Google/GitHub sign-up counts against the same
// per-device account limit as email sign-up.
const FINGERPRINT_HEADER = "x-device-fingerprint";

/**
 * The paid order this sign-in should claim, sent by apps/web after a checkout
 * (the email form sends the same field to /api/auth/login). Optional; anything
 * that is not a plausible order id is ignored rather than rejected.
 */
async function orderIdFromBody(request: NextRequest): Promise<string | null> {
  try {
    const body = (await request.json()) as { orderId?: unknown } | null;
    const orderId = body?.orderId;
    return typeof orderId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(orderId) ? orderId : null;
  } catch {
    return null;
  }
}

export async function handleClerkSession(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  // A missing secret key is a deployment fault, not a bad credential. Returning
  // 401 for it made a misconfigured server look exactly like a rejected token,
  // which is what makes this class of problem so slow to diagnose.
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY is not set: social sign-in cannot create an application session.");
    return NextResponse.json({ error: "Sign-in is not configured" }, { status: 503 });
  }
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const verified = await verifyToken(token, { secretKey });
    if (!verified.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clerk = createClerkClient({ secretKey });
    const clerkUser = await clerk.users.getUser(verified.sub);
    // Accounts are matched by email, so an unverified address must never be
    // trusted: anyone could claim someone else's address and be linked to
    // their account.
    const primary = clerkUser.primaryEmailAddress;
    const email = primary?.verification?.status === "verified" ? primary.emailAddress.trim().toLowerCase() : null;
    if (!email) return NextResponse.json({ error: "A verified email is required" }, { status: 400 });

    const existing = await db.user.findUnique({ where: { email } });
    if (existing?.suspendedAt) return NextResponse.json({ error: "Account suspended" }, { status: 403 });

    const rawFingerprint = request.headers.get(FINGERPRINT_HEADER)?.trim();
    const fingerprintId = rawFingerprint && rawFingerprint.length >= 8 && rawFingerprint.length <= 512 ? rawFingerprint : null;
    if (!existing) {
      try {
        await assertDeviceCanCreateAccount(db, fingerprintId);
      } catch (error) {
        if (error instanceof DeviceAccountLimitError) return NextResponse.json({ error: error.message, code: "DEVICE_ACCOUNT_LIMIT" }, { status: 409 });
        throw error;
      }
    }

    const user = existing
      ? await db.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date(), ...(existing.googleId ? {} : { googleId: verified.sub }) } })
      : await db.user.create({ data: { email, googleId: verified.sub, passwordHash: null, name: clerkUser.firstName ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}` : null, imageUrl: clerkUser.imageUrl } });

    // The order just paid for, whatever email Razorpay recorded; then any
    // other paid orders under this verified email.
    const orderId = await orderIdFromBody(request);
    if (orderId) await claimOrder(db, orderId, user.id);
    await claimPaidOrdersForUser(db, user.id, user.email, { emailVerified: true });
    await claimTrialDevice(db, user.id, fingerprintId);
    const session = await createSession(db, user.id);
    const response = NextResponse.json({ id: user.id, email: user.email });
    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    // The usual cause in a fresh deployment is the web app and this API holding
    // keys from two different Clerk instances: the token verifies against
    // neither, and every sign-in dead-ends at /login with no clue why.
    const instance = secretKey.startsWith("sk_test_") ? "development (sk_test_…)" : "production (sk_live_…)";
    console.error(
      `Clerk token verification failed. This API is using a ${instance} secret key — check it belongs to the same Clerk instance as the web app's NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleClerkSession(prisma, request);
}