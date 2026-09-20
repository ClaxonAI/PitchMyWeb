import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { getMessage } from "../../../../../lib/whatsapp/message.service";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/whatsapp/messages/:id — scoped by userId, so another user's
// message id is a 404.
export async function handleGetWhatsAppMessage(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const message = await getMessage(db, user.id, id);
  return jsonOk(message);
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetWhatsAppMessage(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
