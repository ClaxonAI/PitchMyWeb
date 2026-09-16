import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../../../generated/prisma/client";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { createWebsiteProject } from "../../../../../lib/websites/website.service";
import { websiteProjectUpdateSchema } from "../../../../../lib/validation/website";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/leads/:id/demo (backend_tasks.md section 24, listed alongside
// /analyze, /pitch, /whatsapp). Section 29 separately requires POST
// /api/websites for the same underlying action (a lead's demo/website is
// generated) — both endpoints deliberately share one implementation:
// this route takes leadId from the URL path instead of the request body
// and delegates entirely to the exact same createWebsiteProject domain
// service POST /api/websites already uses. Ownership check, unique-slug
// generation, WebsiteProject + initial WebsiteVersion creation, and the
// WEBSITE_GENERATED activity/lifecycle wiring are defined exactly once,
// in lib/websites/website.service.ts — nothing here reimplements any of
// that, and nothing here touches Lead lifecycle rules beyond what
// createWebsiteProject already does (ANALYZED -> SITE_READY when
// eligible, a direct activity record otherwise).
//
// Body validation reuses websiteProjectUpdateSchema ({contentJSON,
// designJSON?}) rather than websiteProjectCreateSchema — leadId is not a
// body field here, it comes from the path, validated the same way every
// other /api/leads/:id/* route validates it (cuidSchema). Both schemas
// already share this exact shape (lib/validation/website.ts); reusing the
// update schema avoids defining a third, structurally-identical schema
// just to give it a different name.
export async function handleGenerateDemo(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const leadId = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, websiteProjectUpdateSchema);

  const project = await createWebsiteProject(db, user.id, { leadId, ...body });
  return jsonOk(project, 201);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGenerateDemo(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
