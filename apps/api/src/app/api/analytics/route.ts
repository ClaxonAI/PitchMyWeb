import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../lib/db/client";
import { requireCurrentUser } from "../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../lib/api/response";
import { getAnalyticsForUser } from "../../../lib/analytics/analytics.service";

// GET /api/analytics (Phase 8 section 6): no query parameters — the
// endpoint always returns the authenticated user's own full summary, so
// there is nothing here to Zod-validate beyond the session itself.
// The summary is nine aggregate queries over the user's whole history and is
// re-requested on every dashboard visit. Serving a per-user copy for a few
// seconds keeps navigation snappy; the numbers are derived live, so a short
// stale window is harmless. Bounded so it cannot grow without limit.
const ANALYTICS_CACHE_TTL_MS = 30_000;
const ANALYTICS_CACHE_MAX_USERS = 500;
const analyticsCache = new Map<string, { expiresAt: number; summary: Awaited<ReturnType<typeof getAnalyticsForUser>> }>();

export async function handleGetAnalytics(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const cacheable = process.env.VITEST !== "true" && process.env.NODE_ENV !== "test";
  const hit = cacheable ? analyticsCache.get(user.id) : undefined;
  if (hit && hit.expiresAt > Date.now()) return jsonOk(hit.summary);

  const summary = await getAnalyticsForUser(db, user.id);
  if (cacheable) {
    if (analyticsCache.size >= ANALYTICS_CACHE_MAX_USERS) analyticsCache.delete(analyticsCache.keys().next().value as string);
    analyticsCache.set(user.id, { expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS, summary });
  }
  return jsonOk(summary);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleGetAnalytics(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
