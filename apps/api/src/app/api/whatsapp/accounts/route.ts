import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { createAccount, listAccounts } from "../../../../lib/whatsapp/account.service";
import { accountCreateSchema } from "../../../../lib/validation/whatsapp";

// GET /api/whatsapp/accounts — the caller's linked accounts.
export async function handleListWhatsAppAccounts(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const accounts = await listAccounts(db, user.id);
  return jsonOk({ items: accounts });
}

// POST /api/whatsapp/accounts — creates an empty account to link against.
// No body: there is nothing for a client to supply, because the phone
// number and display name come from WhatsApp itself once the device is
// linked, never from the request.
export async function handleCreateWhatsAppAccount(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  await parseOptionalJsonBody(request, accountCreateSchema);
  const account = await createAccount(db, user.id);
  return jsonOk(account, 201);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListWhatsAppAccounts(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCreateWhatsAppAccount(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
