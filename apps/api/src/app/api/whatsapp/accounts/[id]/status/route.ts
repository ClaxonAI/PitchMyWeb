import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { getAccount } from "../../../../../../lib/whatsapp/account.service";
import { cuidSchema } from "../../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/whatsapp/accounts/:id/status
//
// The polling fallback for browsers where EventSource is unavailable or the
// stream dropped. It reads the same account row the worker writes before it
// publishes any event, so polling and streaming can never disagree about
// what happened — only about how quickly the client heard.
export async function handleGetWhatsAppStatus(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const account = await getAccount(db, user.id, id);
  return jsonOk({
    accountId: account.id,
    status: account.status,
    phoneNumber: account.phoneNumber,
    displayName: account.displayName,
    lastConnectedAt: account.lastConnectedAt,
    lastSeenAt: account.lastSeenAt,
    lastError: account.lastError,
  });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetWhatsAppStatus(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
