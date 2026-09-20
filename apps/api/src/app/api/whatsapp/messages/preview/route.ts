import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { previewMessage } from "../../../../../lib/whatsapp/message.service";
import { messagePreviewSchema } from "../../../../../lib/validation/whatsapp";

// POST /api/whatsapp/messages/preview
//
// A dry run: the exact text that would be sent, the normalized number, and
// the policy verdict — without creating anything. This is what lets the UI
// show "this number has opted out" before the user commits, rather than
// after.
//
// A denial is a normal 200 response here, not an error: the caller asked
// what would happen, and "it would be blocked, because…" is a successful
// answer to that question.
export async function handlePreviewWhatsAppMessage(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, messagePreviewSchema);
  const preview = await previewMessage(db, user.id, body);
  return jsonOk(preview);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handlePreviewWhatsAppMessage(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
