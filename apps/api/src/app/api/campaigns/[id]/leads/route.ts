import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseQuery } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { listCampaignLeads } from "../../../../../lib/campaigns/selection.service";
import { cuidSchema } from "../../../../../lib/validation/common";
import { campaignLeadsQuerySchema } from "../../../../../lib/validation/pipeline";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id/leads?sort=score|recent&search=
// The campaign's discovered leads, ranked for selection.
export async function handleListCampaignLeads(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const query = parseQuery(request, campaignLeadsQuerySchema);
  return jsonOk(await listCampaignLeads(db, user.id, id, query));
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleListCampaignLeads(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
