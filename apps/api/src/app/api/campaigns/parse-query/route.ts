import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { parseCampaignQueryRequestSchema } from "../../../../lib/validation/campaign-query";
import { parseCampaignQuery, resolveCampaignQueryParser } from "../../../../lib/ai/parse-campaign-query.service";
import type { CampaignQueryParser } from "../../../../lib/ai/campaign-query-parser";

export async function handleParseCampaignQuery(
  db: PrismaClient,
  request: NextRequest,
  parser: CampaignQueryParser | null = resolveCampaignQueryParser(),
): Promise<NextResponse> {
  await requireCurrentUser(db, request);
  const body = await parseJsonBody(request, parseCampaignQueryRequestSchema);
  const result = await parseCampaignQuery(body.query, parser);
  return jsonOk(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleParseCampaignQuery(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
