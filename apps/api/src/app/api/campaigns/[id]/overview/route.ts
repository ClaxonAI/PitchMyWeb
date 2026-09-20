import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { getCampaignOverview } from "../../../../../lib/pipeline/pipeline-view";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id/overview
// Campaign + latest discovery run + pipeline counts, polled by the dashboard.
export async function handleCampaignOverview(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const overview = await getCampaignOverview(db, user.id, id);
  return jsonOk(overview);
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleCampaignOverview(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
