import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../generated/prisma/client";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { getAnalyticsForUser } from "../../../lib/analytics/analytics.service";

// GET /api/analytics (Phase 8 section 6): no query parameters — the
// endpoint always returns the authenticated user's own full summary, so
// there is nothing here to Zod-validate beyond the session itself.
export async function handleGetAnalytics(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const summary = await getAnalyticsForUser(db, user.id);
  return jsonOk(summary);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleGetAnalytics(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
