import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { parseQuery } from "../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { listActivitiesForUser } from "../../../lib/activities/activity.service";
import { activityListQuerySchema } from "../../../lib/validation/activity";

// GET /api/activities (Phase 1 dashboard): a cross-lead activity feed,
// scoped to the authenticated user's own campaigns at the database level
// (activity.service.listActivitiesForUser) — never fetched in bulk and
// filtered here, same convention as every other list endpoint.
export async function handleListActivities(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, activityListQuerySchema);
  const result = await listActivitiesForUser(db, user.id, query);
  return jsonOk(result);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListActivities(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
