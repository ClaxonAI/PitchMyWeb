import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { requireJobSecret } from "../../../../../lib/jobs/job-auth";
import { runExpireStaleRunsJob } from "../../../../../lib/jobs/expire-stale-runs.job";

// POST /api/internal/jobs/expire-stale-runs
// Called every few minutes by a scheduler with
//   Authorization: Bearer <INTERNAL_JOBS_SECRET>
// Returns { expired, batches, durationMs }.

export async function handleExpireStaleRuns(db: PrismaClient, request: NextRequest, secret?: string): Promise<NextResponse> {
  requireJobSecret(request, secret ?? process.env.INTERNAL_JOBS_SECRET);
  const result = await runExpireStaleRunsJob(db);
  return jsonOk(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleExpireStaleRuns(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
