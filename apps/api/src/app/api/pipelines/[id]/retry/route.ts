import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { rateLimit } from "../../../../../lib/api/rate-limit";
import { retryPipeline, type PipelineDeps } from "../../../../../lib/pipeline/pipeline.service";
import { cuidSchema, emptyBodySchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/pipelines/:id/retry — resume a failed lead from the stage that failed.
export async function handleRetryPipeline(
  db: PrismaClient,
  request: NextRequest,
  params: { id: string },
  deps?: PipelineDeps,
): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await parseOptionalJsonBody(request, emptyBodySchema);
  await rateLimit(`pipeline-retry:user:${user.id}`, 60, 10 * 60 * 1000);
  return jsonOk(await retryPipeline(db, user.id, id, deps));
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleRetryPipeline(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
