import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../../../generated/prisma/client";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { getLeadForUser } from "../../../../../lib/leads/lead.service";
import { cuidSchema } from "../../../../../lib/validation/common";
import { analyzeLead } from "../../../../../lib/ai/lead-analysis.service";
import { createOllamaClientFromEnv, type OllamaClient } from "../../../../../lib/ai/ollama-client";
import { enforceRateLimit } from "../../../../../lib/api/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

const WINDOW_MS = 15 * 60 * 1000;

// POST /api/leads/:id/analyze (backend_tasks.md section 26, Phase 5).
// Architecture: auth -> authorization (implicit in analyzeLead's
// getLeadForUser call) -> path validation -> AI analysis service -> (deterministic
// scoring -> Ollama client -> Zod validation -> business validation ->
// persistence -> activity -> lifecycle transition, all inside
// analyzeLead). No AI/business logic lives in this file.
//
// `ollama` is injectable (defaults to the real env-configured client) so
// tests can pass a fake OllamaClient without ever touching a real Ollama
// server (section 17), the same DI pattern already used for
// POST /api/campaigns/:id/run's `provider` option. Resolved lazily inside
// the body (after authentication) rather than as a default parameter, so
// a missing configuration never pre-empts the 401 an unauthenticated
// caller should get.
export async function handleAnalyzeLead(db: PrismaClient, request: NextRequest, params: { id: string }, ollama?: OllamaClient): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);

  // backend_tasks.md section 41: "rate limiting for... AI-triggering
  // endpoints where practical." Keyed per authenticated user (not IP —
  // this is a session-authenticated endpoint, not a public one) and
  // checked before the expensive Ollama call, same pattern as login's
  // rate limit (lib/api/rate-limit.ts).
  enforceRateLimit(`analyze:user:${user.id}`, 20, WINDOW_MS);

  await analyzeLead(db, ollama ?? createOllamaClientFromEnv(), { leadId: id, userId: user.id });

  // Re-fetch the full detail payload (same convention as PATCH
  // /api/leads/:id, Phase 4 finding #11): the response includes the fresh
  // score, recommendation, deal estimate, latest AI analysis, and the new
  // LEAD_ANALYZED activity, not just a bare Lead row.
  const lead = await getLeadForUser(db, user.id, id);
  return jsonOk(lead);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleAnalyzeLead(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
