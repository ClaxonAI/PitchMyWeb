import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseJsonBody, parseQuery } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { enqueueMessage, listMessages } from "../../../../lib/whatsapp/message.service";
import { messageCreateSchema, messageListQuerySchema } from "../../../../lib/validation/whatsapp";

// GET /api/whatsapp/messages — the caller's outbound messages, newest first.
export async function handleListWhatsAppMessages(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, messageListQuerySchema);
  const result = await listMessages(db, user.id, query);
  return jsonOk(result);
}

// POST /api/whatsapp/messages
//
// Policy gate -> QUEUED row -> send job, in that order. A denial never
// creates a row: nothing was queued, so there is nothing to record, and the
// caller gets the reason as the error code (OPTED_OUT, NOT_CONNECTED, ...).
//
// 202, not 201: the message is accepted for sending, and whether it is
// actually delivered is decided later by the worker, which re-runs the same
// policy plus the checks only a live socket can make.
export async function handleCreateWhatsAppMessage(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, messageCreateSchema);
  const message = await enqueueMessage(db, user.id, body);
  return jsonOk(message, 202);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleListWhatsAppMessages(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCreateWhatsAppMessage(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
