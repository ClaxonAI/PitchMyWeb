import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { z } from "zod";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { updateCampaignMessage } from "../../../../../lib/campaigns/campaign.service";
import { messageTemplateSchema } from "../../../../../lib/pipeline/message-template";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({ messageTemplate: messageTemplateSchema.nullable() }).strict();

// PUT /api/campaigns/:id/message
// Replaces the WhatsApp message the campaign sends. Allowed at any status:
// pitches not yet handed to WhatsApp use the new text.
export async function handleUpdateCampaignMessage(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, bodySchema);
  return jsonOk(await updateCampaignMessage(db, user.id, id, body.messageTemplate));
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleUpdateCampaignMessage(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
