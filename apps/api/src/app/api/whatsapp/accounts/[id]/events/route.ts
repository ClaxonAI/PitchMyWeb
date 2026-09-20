import type { NextRequest } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../../lib/auth/current-user";
import { errorResponse } from "../../../../../../lib/api/response";
import { getAccount } from "../../../../../../lib/whatsapp/account.service";
import { SSE_HEADERS, createEventStream } from "../../../../../../lib/whatsapp/realtime";
import { cuidSchema } from "../../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/whatsapp/accounts/:id/events — Server-Sent Events.
//
// Authenticated by the ordinary session cookie, exactly like every other
// route: EventSource sends cookies on same-origin requests, and the web app
// proxies /api through its own origin so this stays same-origin in the
// browser.
//
// Authorization happens here, before the stream opens: getAccount is scoped
// by { id, userId }, so subscribing to another user's channel is a 404.
// Once open the stream carries only contract events — a QR as a rendered
// image, a pairing code, status changes — and never any auth material.
export async function handleWhatsAppEvents(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<Response> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await getAccount(db, user.id, id);

  const stream = createEventStream({ accountId: id, signal: request.signal });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    return await handleWhatsAppEvents(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}

// Streaming responses must never be cached or statically analysed.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
