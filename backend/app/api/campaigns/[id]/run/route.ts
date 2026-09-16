import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../../../generated/prisma/client";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { runCampaign } from "../../../../../lib/campaigns/run.service";
import { campaignRunRequestSchema } from "../../../../../lib/validation/campaign";
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
  const result = await runCampaign(db, user.id, id, { idempotencyKey: body.idempotencyKey });
  return jsonOk(result);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleRunCampaign(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
