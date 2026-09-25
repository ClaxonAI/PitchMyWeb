import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { errorResponse } from "../../../../../lib/api/response";
import { getPipelineVideoUrl } from "../../../../../lib/pipeline/pipeline-view";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/pipelines/:id/video — redirects to a short-lived signed URL of
// the recorded walkthrough (dashboard video player). Add ?download=1 to have
// the browser save it as an .mp4 instead of playing it.
export async function handlePipelineVideo(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const params_ = new URL(request.url).searchParams;
  const download = params_.get("download") === "1";
  const view = params_.get("view") === "laptop" ? "laptop" : "phone";
  const url = await getPipelineVideoUrl(db, user.id, id, { download, view });
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handlePipelineVideo(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
