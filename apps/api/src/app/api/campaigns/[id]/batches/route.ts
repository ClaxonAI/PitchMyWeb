import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { listCampaignBatches } from "../../../../../lib/pipeline/pipeline-view";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id/batches
// One row per "send N pitches" action on this campaign, with how many of its
// reserved pitches have sent, failed, or are still in flight — the progress
// the dashboard polls while a batch works through the delivery pipeline.
export async function handleCampaignBatches(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const batches = await listCampaignBatches(db, user.id, id);
  return jsonOk(batches);
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleCampaignBatches(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
