import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireAdmin } from "../../../../lib/auth/require-admin";
import { parseQuery } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { listPlatformCampaigns } from "../../../../lib/admin/admin.service";
import { adminCampaignListQuerySchema } from "../../../../lib/validation/admin";

export async function handleAdminListCampaigns(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await requireAdmin(db, request);
  const query = parseQuery(request, adminCampaignListQuerySchema);
  return jsonOk(await listPlatformCampaigns(db, query));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleAdminListCampaigns(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
