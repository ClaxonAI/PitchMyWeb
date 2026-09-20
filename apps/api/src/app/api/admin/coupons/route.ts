import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireSuperAdmin } from "../../../../lib/auth/require-admin";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { createCoupon, listCoupons } from "../../../../lib/admin/admin.service";
import { adminCreateCouponBodySchema } from "../../../../lib/validation/admin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireSuperAdmin(prisma, request);
    return jsonOk(await listCoupons(prisma));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(prisma, request);
    return jsonOk(await createCoupon(prisma, actor, await parseJsonBody(request, adminCreateCouponBodySchema)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}