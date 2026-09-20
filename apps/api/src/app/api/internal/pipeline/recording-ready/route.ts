import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { requireJobSecret } from "../../../../../lib/jobs/job-auth";
import { onRecordingFinished } from "../../../../../lib/pipeline/pipeline.service";
import { recordingReadySchema } from "../../../../../lib/validation/pipeline";

// POST /api/internal/pipeline/recording-ready
//   Authorization: Bearer <INTERNAL_JOBS_SECRET>
//   { recordingId }
// Sent by apps/recorder-worker after it marks a recording READY or FAILED.
// The API then advances the lead's pipeline (delivery happens here, so the
// outreach policy stays in one place). Safe to call more than once.
export async function handleRecordingReady(db: PrismaClient, request: NextRequest, secret?: string): Promise<NextResponse> {
  requireJobSecret(request, secret ?? process.env.INTERNAL_JOBS_SECRET);
  const body = await parseJsonBody(request, recordingReadySchema);
  return jsonOk(await onRecordingFinished(db, body.recordingId));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleRecordingReady(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
