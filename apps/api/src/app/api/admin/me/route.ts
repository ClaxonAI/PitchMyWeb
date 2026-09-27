import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireAdmin } from "../../../../lib/auth/require-admin";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { getMe } from "../../../../lib/users/me.service";

// GET /api/admin/me: who the admin portal is acting as. The web app's admin
// layout asks this instead of /api/me, because admins arrive through
// Cloudflare Access with no app session; a 404 here makes /admin a 404.
export async function handleAdminMe(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(db, request);
  return jsonOk(await getMe(db, admin.id));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleAdminMe(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
