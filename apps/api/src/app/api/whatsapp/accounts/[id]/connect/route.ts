import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { requestConnect } from "../../../../../../lib/whatsapp/account.service";
import { cuidSchema } from "../../../../../../lib/validation/common";
import { connectRequestSchema } from "../../../../../../lib/validation/whatsapp";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/whatsapp/accounts/:id/connect
//
// Returns as soon as the command is queued — linking takes as long as the
// user takes to reach for their phone, so the QR itself arrives over the
// event stream (GET .../events) rather than in this response.
//
// Optional body { stayLinked: true } keeps the number signed in for 3 days;
// without it the number is signed out once the campaign finishes
// (lib/whatsapp/session-policy.ts).
export async function handleConnectWhatsAppAccount(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseOptionalJsonBody(request, connectRequestSchema);
  const account = await requestConnect(db, user.id, id, { stayLinked: body.stayLinked });
  return jsonOk(account, 202);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleConnectWhatsAppAccount(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
