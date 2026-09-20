import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { requestDisconnect } from "../../../../../../lib/whatsapp/account.service";
import { cuidSchema, emptyBodySchema } from "../../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/whatsapp/accounts/:id/disconnect
//
// The account row survives so its message history stays readable; the
// worker unlinks the device on WhatsApp, deletes the stored credentials and
// cancels anything still queued for it.
export async function handleDisconnectWhatsAppAccount(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await parseOptionalJsonBody(request, emptyBodySchema);
  const account = await requestDisconnect(db, user.id, id);
  return jsonOk(account, 202);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleDisconnectWhatsAppAccount(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
