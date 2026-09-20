import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { publishWebsiteProject } from "../../../../../lib/websites/website.service";
import { websitePublishRequestSchema } from "../../../../../lib/validation/website";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/websites/:id/publish (section 12): authenticate, authorize
// ownership, validate the project is in a publishable state (DRAFT/READY
// -> PUBLISHED only; already-PUBLISHED or FAILED is rejected as 409), and
// persist only backend-controlled publish state (status + publishedUrl).
// Never touches WebsiteVersion history. No real hosting/deployment step —
// this is backend publish *state* only, as specified.
export async function handlePublishWebsite(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await parseOptionalJsonBody(request, websitePublishRequestSchema);
  const project = await publishWebsiteProject(db, user.id, id);
  return jsonOk(project);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handlePublishWebsite(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
