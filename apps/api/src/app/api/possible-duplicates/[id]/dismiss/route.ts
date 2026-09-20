import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireAdmin } from "../../../../../lib/auth/require-admin";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { dismissPossibleDuplicateById } from "../../../../../lib/business/possible-duplicate.service";
import { cuidSchema } from "../../../../../lib/validation/common";
import { writeAuditLog } from "../../../../../lib/admin/audit";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/possible-duplicates/:id/dismiss: marks a PossibleDuplicate as
// not actually a duplicate. No body — see lib/business/merge.ts's
// dismissPossibleDuplicate for the idempotency/conflict rules.
export async function handleDismissPossibleDuplicate(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireAdmin(db, request);
  const id = cuidSchema.parse(params.id);
  const result = await dismissPossibleDuplicateById(db, id, user.id);
  await writeAuditLog(db, {
    actorId: user.id,
    action: "DUPLICATE_DISMISSED",
    targetType: "PossibleDuplicate",
    targetId: id,
  });
  return jsonOk(result);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleDismissPossibleDuplicate(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
