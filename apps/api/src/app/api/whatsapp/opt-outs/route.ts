import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { isAdminRole } from "../../../../lib/auth/require-admin";
import { parseJsonBody, parseQuery } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { addOptOut, listOptOuts } from "../../../../lib/whatsapp/opt-out.service";
import { optOutCreateSchema, optOutListQuerySchema } from "../../../../lib/validation/whatsapp";

// GET /api/whatsapp/opt-outs — the do-not-contact entries that concern the
// caller (all of them for an admin). Enforcement is global either way; see
// lib/whatsapp/opt-out.service.ts.
export async function handleListOptOuts(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, optOutListQuerySchema);
  const result = await listOptOuts(db, { id: user.id, isAdmin: isAdminRole(user.role) }, query);
  return jsonOk(result);
}

// POST /api/whatsapp/opt-outs — records a manual opt-out, for a business
// that asked to be removed somewhere other than WhatsApp. Idempotent.
export async function handleCreateOptOut(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, optOutCreateSchema);
  const optOut = await addOptOut(db, { id: user.id, isAdmin: isAdminRole(user.role) }, body);
  return jsonOk(optOut, 201);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListOptOuts(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCreateOptOut(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
