import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireAdmin } from "../../../../../lib/auth/require-admin";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { getUserDetail } from "../../../../../lib/admin/admin.service";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

export async function handleAdminGetUser(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  await requireAdmin(db, request);
  const id = cuidSchema.parse(params.id);
  return jsonOk(await getUserDetail(db, id));
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleAdminGetUser(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
