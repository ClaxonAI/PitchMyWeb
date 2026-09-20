import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../lib/db/client";
import { requireAdmin } from "../../../lib/auth/require-admin";
import { parseQuery } from "../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { listPossibleDuplicates } from "../../../lib/business/possible-duplicate.service";
import { possibleDuplicateListQuerySchema } from "../../../lib/validation/possible-duplicate";

// GET /api/possible-duplicates: the Phase 2 dedup review queue. Admin-only
// (Phase 3) — businesses aren't user-owned, so this is a platform queue.
export async function handleListPossibleDuplicates(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await requireAdmin(db, request);
  const query = parseQuery(request, possibleDuplicateListQuerySchema);
  const result = await listPossibleDuplicates(db, query);
  return jsonOk(result);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListPossibleDuplicates(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
