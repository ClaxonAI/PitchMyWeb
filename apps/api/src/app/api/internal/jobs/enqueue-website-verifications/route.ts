import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { requireJobSecret } from "../../../../../lib/jobs/job-auth";
import { runEnqueueWebsiteVerificationsJob } from "../../../../../lib/jobs/enqueue-website-verifications.job";
import { enqueueWebsiteVerification } from "../../../../../lib/pipeline/website-verification-queue";

// POST /api/internal/jobs/enqueue-website-verifications
// Called periodically by a scheduler with
//   Authorization: Bearer <INTERNAL_JOBS_SECRET>
// Returns { enqueued, durationMs }.

export async function handleEnqueueWebsiteVerifications(db: PrismaClient, request: NextRequest, secret?: string): Promise<NextResponse> {
  requireJobSecret(request, secret ?? process.env.INTERNAL_JOBS_SECRET);
  const result = await runEnqueueWebsiteVerificationsJob(db, (businessId) => enqueueWebsiteVerification({ businessId }));
  return jsonOk(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleEnqueueWebsiteVerifications(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
