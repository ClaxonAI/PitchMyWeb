import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { getPublicSettings } from "../../../lib/settings/settings.service";

// GET /api/settings (backend_tasks.md section 35: "Required: GET
// /api/settings... expose configurable service/pricing information
// without exposing secrets"). Authenticated but not per-user-scoped —
// there is no per-user settings concept in the schema, only global
// Service/Settings configuration, so requireCurrentUser here only gates
// "must be logged in," the same way it gates every other route; it never
// filters the result by the caller's id.
//
// No query params, no body — nothing else to Zod-validate. No update
// endpoint is added here (section 35: "Add update endpoints only if
// required by the frontend" — none exists yet, so none is added).
export async function handleGetSettings(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await requireCurrentUser(db, request);
  const settings = await getPublicSettings(db);
  return jsonOk(settings);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleGetSettings(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
