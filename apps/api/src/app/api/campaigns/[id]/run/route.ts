import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { assertCanStartDiscovery, assertMarketAllowed } from "../../../../../lib/checkout/paid-access";
import { assertCampaignRunAllowed } from "../../../../../lib/campaigns/run-guards";
import { loadOwnedCampaign } from "../../../../../lib/campaigns/campaign.service";
import { runCampaign } from "../../../../../lib/campaigns/run.service";
import { campaignRunRequestSchema } from "../../../../../lib/validation/campaign";
import { assertWhatsAppReady } from "../../../../../lib/whatsapp/session-policy";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/campaigns/:id/run (section 8). All idempotency/concurrency
// logic, provider ingestion, and per-business failure isolation lives in
// run.service.ts (Rule 4: no business logic in route handlers) — this
// handler only authenticates, validates the optional idempotencyKey body,
// and reports the result.
//
// Empty bodies are valid (idempotencyKey is optional) — see
// parseOptionalJsonBody.
export async function handleRunCampaign(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseOptionalJsonBody(request, campaignRunRequestSchema);
  await assertCampaignRunAllowed(db, { userId: user.id, campaignId: id, idempotencyKey: body.idempotencyKey });
  await assertCanStartDiscovery(db, user.id);
  const campaign = await loadOwnedCampaign(db, id, user.id);
  await assertMarketAllowed(db, user.id, campaign.market);
  // An Auto campaign pitches from the user's WhatsApp as soon as discovery
  // finishes, and the number is signed out after every campaign — so each
  // run starts with a linked number.
  await assertWhatsAppReady(db, user.id, campaign);
  const result = await runCampaign(db, user.id, id, { idempotencyKey: body.idempotencyKey });
  // An async provider (osm) returns with the run still in progress: 202
  // Accepted, and the client polls GET /api/campaigns/:id for the outcome.
  return jsonOk(result, result.execution.status === "RUNNING" ? 202 : 200);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleRunCampaign(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}