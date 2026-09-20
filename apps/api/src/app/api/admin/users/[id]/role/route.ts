import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireSuperAdmin } from "../../../../../../lib/auth/require-admin";
import { parseJsonBody } from "../../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { setUserRole } from "../../../../../../lib/admin/admin.service";
import { adminSetRoleBodySchema } from "../../../../../../lib/validation/admin";
import { cuidSchema } from "../../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

export async function handleAdminSetUserRole(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const actor = await requireSuperAdmin(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, adminSetRoleBodySchema);
  return jsonOk(await setUserRole(db, actor, id, body.role));
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleAdminSetUserRole(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
