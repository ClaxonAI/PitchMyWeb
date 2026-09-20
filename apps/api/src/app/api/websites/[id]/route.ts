import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { createNewWebsiteVersion, getWebsiteProjectForUser } from "../../../../lib/websites/website.service";
import { websiteProjectUpdateSchema } from "../../../../lib/validation/website";
import { cuidSchema } from "../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/websites/:id: ownership-checked (404 for missing-or-not-yours,
// same convention as campaigns/leads), returns the project with its full,
// ordered WebsiteVersion history.
export async function handleGetWebsite(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const project = await getWebsiteProjectForUser(db, user.id, id);
  return jsonOk(project);
}

// PATCH /api/websites/:id (section 9/10): the only thing a PATCH can do is
// create a new WebsiteVersion with fully-specified content — no status,
// publishedUrl, leadId, or version id is ever accepted from the client
// (websiteProjectUpdateSchema has no fields for any of them). Ownership is
// checked inside createNewWebsiteVersion before anything is written.
export async function handlePatchWebsite(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, websiteProjectUpdateSchema);
  const project = await createNewWebsiteVersion(db, user.id, id, body);
  return jsonOk(project);
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetWebsite(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handlePatchWebsite(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
