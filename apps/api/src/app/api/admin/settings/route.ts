import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma, PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireAdmin } from "../../../../lib/auth/require-admin";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { getPublicSettings, upsertPublicSetting } from "../../../../lib/settings/settings.service";
import { settingsUpsertSchema } from "../../../../lib/validation/settings";
import { writeAuditLog } from "../../../../lib/admin/audit";

export async function handleAdminGetSettings(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await requireAdmin(db, request);
  return jsonOk(await getPublicSettings(db));
}

export async function handleAdminUpsertSetting(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const actor = await requireAdmin(db, request);
  const body = await parseJsonBody(request, settingsUpsertSchema);
  const setting = await upsertPublicSetting(db, {
    key: body.key,
    value: body.value as Prisma.InputJsonValue,
    description: body.description,
  });
  await writeAuditLog(db, {
    actorId: actor.id,
    action: "SETTING_UPSERTED",
    targetType: "Settings",
    targetId: body.key,
    metadata: { key: body.key },
  });
  return jsonOk(setting);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleAdminGetSettings(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleAdminUpsertSetting(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
