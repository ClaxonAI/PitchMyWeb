import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { listCampaignPipelines } from "../../../../../lib/pipeline/pipeline-view";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id/pipeline
// One row per selected lead: stage, preview, recording and send status.
export async function handleCampaignPipeline(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  return jsonOk(await listCampaignPipelines(db, user.id, id));
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleCampaignPipeline(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
