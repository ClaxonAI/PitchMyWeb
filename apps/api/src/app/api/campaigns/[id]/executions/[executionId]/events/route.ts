import type { NextRequest } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../../../lib/auth/current-user";
import { errorResponse } from "../../../../../../../lib/api/response";
import { loadOwnedCampaign } from "../../../../../../../lib/campaigns/campaign.service";
import { NotFoundError } from "../../../../../../../lib/errors";
import { SSE_HEADERS } from "../../../../../../../lib/realtime/sse";
import { createDiscoveryEventStream } from "../../../../../../../lib/discovery/realtime";
import { cuidSchema } from "../../../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string; executionId: string }> };

export async function handleDiscoveryEvents(
  db: PrismaClient,
  request: NextRequest,
  params: { id: string; executionId: string },
): Promise<Response> {
  const user = await requireCurrentUser(db, request);
  const campaignId = cuidSchema.parse(params.id);
  const executionId = cuidSchema.parse(params.executionId);
  const campaign = await loadOwnedCampaign(db, campaignId, user.id);
  const execution = await db.campaignExecution.findFirst({ where: { id: executionId, campaignId: campaign.id } });
  if (!execution) throw new NotFoundError("CampaignExecution", executionId);

  const stream = createDiscoveryEventStream({ executionId, signal: request.signal });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    return await handleDiscoveryEvents(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
