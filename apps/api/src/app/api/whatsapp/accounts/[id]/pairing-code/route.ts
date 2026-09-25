import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../../lib/api/response";
import { requestPairingCode } from "../../../../../../lib/whatsapp/account.service";
import { cuidSchema } from "../../../../../../lib/validation/common";
import { pairingCodeRequestSchema } from "../../../../../../lib/validation/whatsapp";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/whatsapp/accounts/:id/pairing-code
//
// The alternative to a QR, for a user linking from the same device they are
// holding. The code itself comes back over the event stream, for the same
// reason the QR does: WhatsApp only issues it once the socket is open.
export async function handleRequestPairingCode(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseJsonBody(request, pairingCodeRequestSchema);
  const account = await requestPairingCode(db, user.id, id, body.phoneNumber, { stayLinked: body.stayLinked });
  return jsonOk(account, 202);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleRequestPairingCode(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
