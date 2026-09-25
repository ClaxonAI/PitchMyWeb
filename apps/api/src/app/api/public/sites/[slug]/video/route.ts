import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../../lib/db/client";
import { clientIp, rateLimit } from "../../../../../../lib/api/rate-limit";
import { errorResponse } from "../../../../../../lib/api/response";
import { getPublicVideoUrl } from "../../../../../../lib/sites/public-site.service";
import { slugParamSchema } from "../../../../../../lib/validation/pipeline";

type RouteParams = { params: Promise<{ slug: string }> };

// GET /api/public/sites/:slug/video — unauthenticated. Redirects to a
// short-lived signed URL of the preview's walkthrough video. This is the link
// Direct-plan messages carry (via apps/sites /s/:slug/video).
export async function handleGetPublicVideo(db: PrismaClient, request: NextRequest, params: { slug: string }): Promise<NextResponse> {
  await rateLimit(`public-video:${clientIp(request)}`, 120, 60 * 1000);
  const slug = slugParamSchema.parse(params.slug);
  const view = new URL(request.url).searchParams.get("view") === "laptop" ? "laptop" : "phone";
  const url = await getPublicVideoUrl(db, slug, new Date(), view);
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleGetPublicVideo(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
