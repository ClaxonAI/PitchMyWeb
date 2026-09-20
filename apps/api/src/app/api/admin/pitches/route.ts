import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireAdmin } from "../../../../lib/auth/require-admin";
import { parseQuery } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { listPlatformPitches } from "../../../../lib/admin/admin.service";
import { adminPitchListQuerySchema } from "../../../../lib/validation/admin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin(prisma, request);
    return jsonOk(await listPlatformPitches(prisma, parseQuery(request, adminPitchListQuerySchema)));
  } catch (error) {
    return errorResponse(error);
  }
}