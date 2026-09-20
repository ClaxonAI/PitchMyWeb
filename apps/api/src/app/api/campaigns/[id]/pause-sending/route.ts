import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { pauseCampaignSending } from "../../../../../lib/pipeline/pipeline.service";
import { cuidSchema, emptyBodySchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/campaigns/:id/pause-sending
// Cancels this campaign's queued WhatsApp sends; they can be retried later.
export async function handlePauseSending(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await parseOptionalJsonBody(request, emptyBodySchema);
  return jsonOk(await pauseCampaignSending(db, user.id, id));
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handlePauseSending(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
