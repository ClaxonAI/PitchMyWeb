import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireAdmin } from "../../../../lib/auth/require-admin";
import { parseQuery } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { listAuditLogs } from "../../../../lib/admin/admin.service";
import { adminAuditListQuerySchema } from "../../../../lib/validation/admin";

export async function handleAdminListAudit(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await requireAdmin(db, request);
  const query = parseQuery(request, adminAuditListQuerySchema);
  return jsonOk(await listAuditLogs(db, query));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleAdminListAudit(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
