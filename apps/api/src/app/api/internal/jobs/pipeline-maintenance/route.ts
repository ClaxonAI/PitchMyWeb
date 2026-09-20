import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { requireJobSecret } from "../../../../../lib/jobs/job-auth";
import { runPipelineMaintenanceJob } from "../../../../../lib/jobs/pipeline-maintenance.job";

// POST /api/internal/jobs/pipeline-maintenance
//   Authorization: Bearer <INTERNAL_JOBS_SECRET>
// Syncs WhatsApp send outcomes onto pipelines and deletes recordings of
// expired previews. Schedule every 5 minutes next to expire-stale-runs.
export async function handlePipelineMaintenance(db: PrismaClient, request: NextRequest, secret?: string): Promise<NextResponse> {
  requireJobSecret(request, secret ?? process.env.INTERNAL_JOBS_SECRET);
  return jsonOk(await runPipelineMaintenanceJob(db));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handlePipelineMaintenance(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
