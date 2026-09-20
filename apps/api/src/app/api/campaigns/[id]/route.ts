import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { assertFreePitchBudget } from "../../../../lib/checkout/paid-access";
import { getCampaignById, markCampaignReady, updateCampaign } from "../../../../lib/campaigns/campaign.service";
import { campaignUpdateSchema } from "../../../../lib/validation/campaign";
import { cuidSchema } from "../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id (section 7): authenticate, authorize ownership,
// return the campaign. getCampaignById (campaign.service.ts) already
// returns the same 404 for "missing" and "belongs to another user" — never
// return another user's campaign.
export async function handleGetCampaign(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const campaign = await getCampaignById(db, user.id, id);
  return jsonOk(campaign);
}

// PATCH /api/campaigns/:id (section 7): authenticate, authorize ownership,
// validate body, only legitimately editable fields plus the one
// client-triggerable status value (`status: "READY"` — see
// campaignUpdateSchema). Field edits go through updateCampaign (rejects
// edits while campaign is not DRAFT/READY -> 409); a status:"READY" request
// goes through markCampaignReady, which re-validates the transition through
// the campaign status graph rather than writing the field directly.
export async function handlePatchCampaign(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const { status, ...fields } = await parseJsonBody(request, campaignUpdateSchema);

  if (fields.targetCount != null) {
    await assertFreePitchBudget(db, user.id, fields.targetCount);
  }

  let campaign = Object.keys(fields).length > 0 ? await updateCampaign(db, user.id, id, fields) : await getCampaignById(db, user.id, id);

  if (status === "READY") {
    campaign = await markCampaignReady(db, user.id, id);
  }

  return jsonOk(campaign);
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetCampaign(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handlePatchCampaign(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}