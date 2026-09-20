import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { parseJsonBody } from "../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { getMe, updateMe } from "../../../lib/users/me.service";
import { meUpdateSchema } from "../../../lib/validation/me";

// GET /api/me: the frontend's "who am I" check — also the session-cookie's
// own only reliable proof of validity, since a cookie can be present but
// expired/revoked (requireCurrentUser resolves it against the Session
// table, not just the cookie's presence).
export async function handleGetMe(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const profile = await getMe(db, user.id);
  return jsonOk(profile);
}

// PATCH /api/me: update the caller's own display name. Email and password
// each have their own dedicated flow, never bundled here.
export async function handlePatchMe(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, meUpdateSchema);
  const profile = await updateMe(db, user.id, body);
  return jsonOk(profile);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleGetMe(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    return await handlePatchMe(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
