import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { generateWhatsAppAction } from "../../../../../lib/leads/whatsapp.service";
import { emptyBodySchema, cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/leads/:id/whatsapp (backend_tasks.md section 32, Phase 7
// section 13-16). Authenticate, authorize ownership (inside
// generateWhatsAppAction), validate the (empty) body, and delegate
// entirely to the domain service — no WhatsApp API integration, no
// sending, no lifecycle transition happens here or anywhere downstream of
// this route.
//
// Response is the created Outreach row plus the whatsappUrl directly (not
// the full lead detail): this action doesn't change anything about the
// Lead itself, only creates a side record, so a focused response is
// thinner than re-fetching the whole lead. See lib/leads/whatsapp.service.ts
// for why no WHATSAPP_OPENED Activity is ever created here.
export async function handleGenerateWhatsAppAction(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await parseOptionalJsonBody(request, emptyBodySchema);

  const result = await generateWhatsAppAction(db, { leadId: id, userId: user.id });
  return jsonOk(result);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGenerateWhatsAppAction(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
