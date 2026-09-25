import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { SESSION_COOKIE_NAME, deleteSessionByToken } from "../../../../lib/auth/session";
import { errorResponse, jsonOk } from "../../../../lib/api/response";

const SIGNED_IN_HINT_COOKIE = "pmw_signed_in";

export async function handleLogout(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await deleteSessionByToken(db, token);
  }

  const response = jsonOk({ success: true });
  // Expired explicitly, with the same attributes the cookies were set with,
  // so every browser drops them. The pmw_signed_in hint belongs to the web
  // app (middleware.ts); the API is served on the same origin through its
  // /api rewrite, so it can clear it here too.
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set(SIGNED_IN_HINT_COOKIE, "", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleLogout(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
