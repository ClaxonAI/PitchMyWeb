import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { requireCurrentUser } from "../../../../../lib/auth/current-user";
import { errorResponse } from "../../../../../lib/api/response";
import { rateLimit } from "../../../../../lib/api/rate-limit";
import { exportPublishedSite, type ExportDeps } from "../../../../../lib/websites/site-export";
import { cuidSchema } from "../../../../../lib/validation/common";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/websites/:id/download — the published site as a ZIP (index.html
// plus its CSS, fonts and images). Ownership-checked like every website
// route; 409 when the site is not published or its preview has expired.
export async function handleDownloadWebsite(db: PrismaClient, request: NextRequest, params: { id: string }, deps?: ExportDeps): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const id = cuidSchema.parse(params.id);
  // Each export fetches the page and its assets: bounded per user.
  await rateLimit(`website-download:user:${user.id}`, 30, 60 * 60 * 1000);
  const { filename, zip } = await exportPublishedSite(db, user.id, id, deps);
  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Content-Length": String(zip.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    return await handleDownloadWebsite(prisma, request, await params);
  } catch (error) {
    return errorResponse(error);
  }
}
