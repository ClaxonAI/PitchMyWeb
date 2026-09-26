import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { requireJobSecret } from "../../../../../../lib/jobs/job-auth";
import { NotFoundError, ConflictError } from "../../../../../../lib/errors";
import { cuidSchema } from "../../../../../../lib/validation/common";
import { excludedExternalIds } from "../../../../../../lib/leads/claims.service";

type RouteParams = { params: Promise<{ executionId: string }> };

// GET /api/internal/pipeline/discovery-jobs/:executionId
//   Authorization: Bearer <INTERNAL_JOBS_SECRET>
// apps/discovery-worker is deliberately DB-free (no worker-owned entity to
// write, unlike apps/recorder-worker's DemoRecording — see the Phase 2 plan's
// "lighter worker" note) — it fetches the search parameters it needs here,
// right before processing, rather than trusting whatever was true when the
// job was enqueued (the same "DB row is source of truth" principle
// RecordingJob/DiscoveryJob's job-carries-only-an-id shape already follows).
export async function handleGetDiscoveryJob(db: PrismaClient, request: NextRequest, params: { executionId: string }, secret?: string): Promise<NextResponse> {
  requireJobSecret(request, secret);
  const executionId = cuidSchema.parse(params.executionId);

  const execution = await db.campaignExecution.findUnique({ where: { id: executionId }, include: { campaign: true } });
  if (!execution) throw new NotFoundError("CampaignExecution", executionId);
  if (execution.status !== "RUNNING") {
    throw new ConflictError(`Execution ${executionId} is not RUNNING (already ${execution.status})`);
  }

  const { campaign } = execution;
  // Businesses the worker should not even look at: held by another user
  // (business exclusivity) or already given to this one.
  const excluded = await Promise.all(
    ["serper", "osm"].map((source) => excludedExternalIds(db, { userId: campaign.userId, source, location: campaign.location })),
  );
  return jsonOk({
    executionId: execution.id,
    location: campaign.location,
    category: campaign.category,
    radius: campaign.radius,
    minRating: campaign.minRating,
    minReviews: campaign.minReviews,
    leadLimit: campaign.leadLimit,
    excludeExternalIds: [...new Set(excluded.flat())],
  });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetDiscoveryJob(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
