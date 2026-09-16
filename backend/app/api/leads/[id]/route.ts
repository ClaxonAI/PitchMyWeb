import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../../generated/prisma/client";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { getLeadForUser } from "../../../../lib/leads/lead.service";
import { transitionLeadStatus } from "../../../../lib/leads/lifecycle";
import { leadPatchSchema } from "../../../../lib/validation/lead";
import { cuidSchema } from "../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/leads/:id (section 10): authenticate, authorize ownership
// through the lead's campaign/user relationship (lead.service.getLeadForUser
// throws 404 for missing-or-not-yours, same convention as campaigns), and
// return the full detail payload the lead detail page needs — business,
// latest score breakdown, recommendation/deal estimate, website/pitch/
// outreach state, and the activity timeline all come from the same include
// set already built in lead.service.ts (no data invented here).
export async function handleGetLead(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  const lead = await getLeadForUser(db, user.id, id);
  return jsonOk(lead);
}

// PATCH /api/leads/:id (section 11): the only PATCH-able thing on a Lead
// right now is its lifecycle status (leadPatchSchema accepts nothing else —
// score, recommendation, deal, campaignId, businessId are all server-
// controlled). Ownership is checked *before* attempting the transition, so
// a guessed leadId belonging to another user's campaign 404s without ever
// reaching the lifecycle service; `expectedOwnerUserId` is also passed
// through to transitionLeadStatus itself as defense-in-depth (Phase 4
// code-review finding #10), so the domain service enforces the same check
// independently of this route remembering to do it first. The actual
// transition is delegated entirely to transitionLeadStatus (lifecycle.ts):
// illegal transitions throw InvalidLeadTransitionError (409) without
// mutating the lead or creating an Activity; legal ones update the lead and
// record the mapped Activity in one transaction.
//
// transitionLeadStatus's signature (Phase 3) is `{leadId, nextStatus,
// metadata?}` — it has no `actorId` field, and Activity has no actorId
// column (Phase 1 schema). Rather than extending that schema for this
// phase, the acting user is threaded through the existing `metadata` JSON
// field, which is exactly what it exists for (documented Rule 10 choice).
//
// The response re-fetches the full lead detail after the transition
// (Phase 4 code-review finding #11) rather than returning
// transitionLeadStatus's bare Lead row: GET and PATCH now return the same
// shape for the same resource, matching the ordinary REST expectation that
// PATCH returns the updated resource the way GET would show it.
export async function handlePatchLead(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  await getLeadForUser(db, user.id, id);

  const body = await parseJsonBody(request, leadPatchSchema);
  await transitionLeadStatus(db, { leadId: id, nextStatus: body.status, metadata: { actorId: user.id }, expectedOwnerUserId: user.id });

  const lead = await getLeadForUser(db, user.id, id);
  return jsonOk(lead);
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetLead(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handlePatchLead(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
