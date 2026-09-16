import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../generated/prisma/client";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { parseQuery } from "../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { listLeadsForUser } from "../../../lib/leads/lead.service";
import { leadListQuerySchema } from "../../../lib/validation/lead";

// GET /api/leads (section 9): campaign/status/score-range/
// recommendedService/search filtering + pagination, scoped to the
// authenticated user's own campaigns at the database level
// (lead.service.listLeadsForUser) — never fetched in bulk and filtered here.
export async function handleListLeads(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, leadListQuerySchema);
  const result = await listLeadsForUser(db, user.id, query);
  return jsonOk(result);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListLeads(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
