import { createClerkClient, verifyToken } from "@clerk/backend";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { claimPaidOrdersForUser } from "../../../../../lib/checkout/checkout.service";

export async function handleClerkSession(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!secretKey || !token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const user = existing
      ? await db.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date(), ...(existing.googleId ? {} : { googleId: verified.sub }) } })
      : await db.user.create({ data: { email, googleId: verified.sub, passwordHash: null, name: clerkUser.firstName ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}` : null, imageUrl: clerkUser.imageUrl } });

    await claimPaidOrdersForUser(db, user.id, user.email);
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleClerkSession(prisma, request);
}