import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireAdmin } from "../../../../../../lib/auth/require-admin";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { restoreUser } from "../../../../../../lib/admin/admin.service";
import { cuidSchema } from "../../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

export async function handleAdminRestoreUser(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const actor = await requireAdmin(db, request);
  const id = cuidSchema.parse(params.id);
  return jsonOk(await restoreUser(db, actor, id));
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleAdminRestoreUser(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
