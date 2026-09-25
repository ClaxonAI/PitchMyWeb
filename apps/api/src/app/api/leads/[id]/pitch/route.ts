import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { getLeadForUser } from "../../../../../lib/leads/lead.service";
import { generatePitch } from "../../../../../lib/ai/pitch.service";
import { createAiClientFromEnv, type AiClient } from "../../../../../lib/ai/ai-client";
import { emptyBodySchema, cuidSchema } from "../../../../../lib/validation/common";
import { rateLimit } from "../../../../../lib/api/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

const WINDOW_MS = 15 * 60 * 1000;

// POST /api/leads/:id/pitch (backend_tasks.md section 31, Phase 7).
// Architecture: auth -> authorization (inside generatePitch's ownership
// check) -> path validation -> pitch service -> (AI client -> Zod
// validation -> factual-safety validation -> persistence -> activity, all
// inside generatePitch/persistGeneratedPitch). No AI/business logic lives
// in this file.
//
// `ai` is injectable (defaults to the real env-configured client, the
// same DI pattern already used for POST /api/campaigns/:id/run's
// `provider` option and POST /api/leads/:id/analyze) so tests never touch
// a real model. Resolved lazily inside the body (after
// authentication), not as a default parameter, so a missing configuration
// never pre-empts the 401 an unauthenticated caller should get.
//
// Response is the full lead detail (same convention as POST
// /api/leads/:id/analyze and PATCH /api/leads/:id) — includes the new
// Pitch in `pitches` and the new PITCH_GENERATED entry in `activities`.
// Generating a pitch never transitions lead.status (section 12): the
// response's `status` field is unchanged from before the call.
export async function handleGeneratePitch(db: PrismaClient, request: NextRequest, params: { id: string }, ai?: AiClient): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await parseOptionalJsonBody(request, emptyBodySchema);

  // backend_tasks.md section 41: "rate limiting for... AI-triggering
  // endpoints where practical." Keyed per authenticated user, checked
  // before the expensive model call — same pattern as
  // POST /api/leads/:id/analyze and login's rate limit.
  await rateLimit(`pitch:user:${user.id}`, 20, WINDOW_MS);

  await generatePitch(db, ai ?? createAiClientFromEnv(), { leadId: id, userId: user.id });

  const lead = await getLeadForUser(db, user.id, id);
  return jsonOk(lead);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGeneratePitch(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
