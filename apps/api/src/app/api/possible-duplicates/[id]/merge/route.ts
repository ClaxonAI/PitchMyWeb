import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireAdmin } from "../../../../../lib/auth/require-admin";
import { parseOptionalJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { mergePossibleDuplicateById } from "../../../../../lib/business/possible-duplicate.service";
import { mergePossibleDuplicateSchema } from "../../../../../lib/validation/possible-duplicate";
import { cuidSchema } from "../../../../../lib/validation/common";
import { writeAuditLog } from "../../../../../lib/admin/audit";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/possible-duplicates/:id/merge: confirms a PossibleDuplicate as a
// real duplicate. All the merge logic (winner/loser, lead reassignment,
// BusinessMerge audit row) lives in lib/business/merge.ts — this handler
// only authenticates, validates, and calls it.
export async function handleMergePossibleDuplicate(db: PrismaClient, request: NextRequest, params: { id: string }): Promise<NextResponse> {
  const user = await requireAdmin(db, request);
  const id = cuidSchema.parse(params.id);
  const body = await parseOptionalJsonBody(request, mergePossibleDuplicateSchema);
  const result = await mergePossibleDuplicateById(db, id, user.id, body.reason);
  await writeAuditLog(db, {
    actorId: user.id,
    action: "DUPLICATE_MERGED",
    targetType: "PossibleDuplicate",
    targetId: id,
  });
  return jsonOk(result);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleMergePossibleDuplicate(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
