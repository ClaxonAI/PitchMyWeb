import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseJsonBody, parseQuery } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { addOptOut, listOptOuts } from "../../../../lib/whatsapp/opt-out.service";
import { optOutCreateSchema, optOutListQuerySchema } from "../../../../lib/validation/whatsapp";

// GET /api/whatsapp/opt-outs — the global do-not-contact list.
//
// Authenticated but not per-user scoped, the same way GET /api/settings is:
// the list is global by design (see lib/whatsapp/opt-out.service.ts), and it
// holds only phone numbers and why they were added — never anything about
// whose lead they were.
export async function handleListOptOuts(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await requireCurrentUser(db, request);
  const query = parseQuery(request, optOutListQuerySchema);
  const result = await listOptOuts(db, query);
  return jsonOk(result);
}

// POST /api/whatsapp/opt-outs — records a manual opt-out, for a business
// that asked to be removed somewhere other than WhatsApp. Idempotent.
export async function handleCreateOptOut(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, optOutCreateSchema);
  const optOut = await addOptOut(db, body);
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
