import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../generated/prisma/client";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { parseJsonBody, parseQuery } from "../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { createWebsiteProject, listWebsiteProjectsForUser } from "../../../lib/websites/website.service";
import { websiteListQuerySchema, websiteProjectCreateSchema } from "../../../lib/validation/website";

// GET /api/websites (section 1): only the authenticated user's own website
// projects (scoped through Lead -> Campaign -> User at the query level in
// website.service.ts), paginated.
export async function handleListWebsites(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, websiteListQuerySchema);
  const result = await listWebsiteProjectsForUser(db, user.id, query);
  return jsonOk(result);
}

// POST /api/websites (section 7): authenticate -> validate -> domain
// service (lead ownership check, slug generation, project + initial
// version creation, all inside website.service.ts) -> normalized response.
export async function handleCreateWebsite(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, websiteProjectCreateSchema);
  const project = await createWebsiteProject(db, user.id, body);
  return jsonOk(project, 201);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListWebsites(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCreateWebsite(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
