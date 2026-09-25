import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { deleteAccount, getAccount, setStayLinked } from "../../../../../lib/whatsapp/account.service";
import { cuidSchema } from "../../../../../lib/validation/common";
import { accountUpdateSchema } from "../../../../../lib/validation/whatsapp";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/whatsapp/accounts/:id — another user's id returns 404, not 403:
// the service scopes every lookup by { id, userId }, so the existence of
// someone else's account is never confirmed.
export async function handleGetWhatsAppAccount(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const account = await getAccount(db, user.id, id);
  return jsonOk(account);
}

// PATCH /api/whatsapp/accounts/:id — { stayLinked: boolean }: keep this
// number signed in for 3 days, or sign it out when the campaign finishes
// (lib/whatsapp/session-policy.ts).
export async function handlePatchWhatsAppAccount(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, accountUpdateSchema);
  const account = await setStayLinked(db, user.id, id, body.stayLinked);
  return jsonOk(account);
}

// DELETE /api/whatsapp/accounts/:id — unlinks the device on WhatsApp and
// removes the row. The stored auth keys and message history go with it
// through the schema's cascade.
export async function handleDeleteWhatsAppAccount(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await deleteAccount(db, user.id, id);
  return jsonOk({ deleted: true });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetWhatsAppAccount(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handlePatchWhatsAppAccount(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleDeleteWhatsAppAccount(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
