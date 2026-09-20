import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { clientIp, rateLimit } from "../../../../../lib/api/rate-limit";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { getPublicSite } from "../../../../../lib/sites/public-site.service";
import { slugParamSchema } from "../../../../../lib/validation/pipeline";

type RouteParams = { params: Promise<{ slug: string }> };

// GET /api/public/sites/:slug — unauthenticated. Read by apps/sites to
// render a published preview. Content only.
export async function handleGetPublicSite(db: PrismaClient, request: NextRequest, params: { slug: string }): Promise<NextResponse> {
  await rateLimit(`public-site:${clientIp(request)}`, 240, 60 * 1000);
  const slug = slugParamSchema.parse(params.slug);
  const site = await getPublicSite(db, slug);
  const response = jsonOk(site);
  response.headers.set("Cache-Control", "public, max-age=60, s-maxage=300");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetPublicSite(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
