import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseQuery } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { listCreditLedger } from "../../../../lib/checkout/wallet.service";
import { paginationQuerySchema } from "../../../../lib/validation/common";

// GET /api/pitch-credits/ledger
// Every movement of this user's pitch credits, newest first, plus the balance
// they add up to: what was purchased or granted, what each batch reserved,
// what was released unused, what a sent pitch consumed, and what a failed one
// refunded. The audit trail behind "where did my credits go?" — scoped to the
// caller at the query level, same as every other list endpoint.
export async function handleCreditLedger(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const query = parseQuery(request, paginationQuerySchema);
  return jsonOk(await listCreditLedger(db, user.id, query));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleCreditLedger(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
