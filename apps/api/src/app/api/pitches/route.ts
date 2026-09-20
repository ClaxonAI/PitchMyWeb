import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { parseQuery } from "../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { listPitchesForUser } from "../../../lib/pitches/pitch.service";
import { pitchListQuerySchema } from "../../../lib/validation/pitch";

// GET /api/pitches (Phase 1 dashboard): every generated pitch across the
// authenticated user's own campaigns, scoped at the database level
// (pitch.service.listPitchesForUser) — never fetched in bulk and filtered
// here, same convention as every other list endpoint.
export async function handleListPitches(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, pitchListQuerySchema);
  const result = await listPitchesForUser(db, user.id, query);
  return jsonOk(result);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListPitches(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
