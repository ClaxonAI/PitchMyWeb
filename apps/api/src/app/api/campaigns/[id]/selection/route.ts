import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { rateLimit } from "../../../../../lib/api/rate-limit";
import { autoSelectForUser, selectLeads } from "../../../../../lib/campaigns/selection.service";
import type { PipelineDeps } from "../../../../../lib/pipeline/pipeline.service";
import { cuidSchema } from "../../../../../lib/validation/common";
import { campaignSelectionSchema } from "../../../../../lib/validation/pipeline";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/campaigns/:id/selection
//   { leadIds: [...] }        pitch these specific leads
//   { auto: true }            pitch every remaining eligible lead
//   { auto: true, count: N }  pitch up to N remaining eligible leads (the
//                             "how many do you want to pitch?" flow) —
//                             reserves at most N credits; never more.
// Starts the delivery pipeline (build site -> record -> send) for each.
export async function handleSelectLeads(
  db: PrismaClient,
  request: NextRequest,
  params: { id: string },
  deps?: PipelineDeps,
): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, campaignSelectionSchema);
  await rateLimit(`selection:user:${user.id}`, 30, 10 * 60 * 1000);

  const result =
    "auto" in body ? await autoSelectForUser(db, user.id, id, { count: body.count }, deps) : await selectLeads(db, user.id, id, body.leadIds, deps);
  return jsonOk({ started: result.started.length, pipelines: result.started }, 202);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleSelectLeads(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
