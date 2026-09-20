import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireAdmin } from "../../../../../../lib/auth/require-admin";
import { parseJsonBody } from "../../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { setUserPlan } from "../../../../../../lib/admin/admin.service";
import { adminSetPlanBodySchema } from "../../../../../../lib/validation/admin";
import { cuidSchema } from "../../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

export async function handleAdminSetUserPlan(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const actor = await requireAdmin(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, adminSetPlanBodySchema);
  return jsonOk(await setUserPlan(db, actor, id, body.planId));
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleAdminSetUserPlan(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
