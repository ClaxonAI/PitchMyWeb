import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { parseJsonBody, parseQuery } from "../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { assertCanStartDiscovery, assertMarketAllowed } from "../../../lib/checkout/paid-access";
import { createCampaign, listCampaignsForUser } from "../../../lib/campaigns/campaign.service";
import { campaignCreateSchema, campaignListQuerySchema } from "../../../lib/validation/campaign";

// GET /api/campaigns (section 7): campaigns belonging only to the
// authenticated user, paginated. All business logic (ownership scoping,
// pagination) lives in campaign.service.ts — this handler only
// authenticates, validates, and calls it.
export async function handleListCampaigns(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, campaignListQuerySchema);
  const result = await listCampaignsForUser(db, user.id, query);
  return jsonOk(result);
}

// POST /api/campaigns (section 7): authenticate -> validate -> domain
// service -> normalized campaign. Status is never accepted from the client
// (campaignCreateSchema has no status field) — createCampaign always sets
// DRAFT.
export async function handleCreateCampaign(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, campaignCreateSchema);
  await assertCanStartDiscovery(db, user.id);
  await assertMarketAllowed(db, user.id, body.market);
  const campaign = await createCampaign(db, user.id, body);
  return jsonOk(campaign, 201);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListCampaigns(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCreateCampaign(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}