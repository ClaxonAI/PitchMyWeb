import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { rateLimit } from "../../../../lib/api/rate-limit";
import { nicheAvailability, type AvailabilityDeps } from "../../../../lib/niches/availability.service";

const querySchema = z.object({ location: z.string().trim().min(2).max(80) });

// GET /api/niches/availability?location=Chennai
// Per niche with a ready website template: how many businesses without a
// website near that location this user could pitch. Counts come from a paid
// search (cached a day per city), hence the per-user rate limit.
export async function handleNicheAvailability(db: PrismaClient, request: NextRequest, deps?: AvailabilityDeps): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  const { location } = querySchema.parse({ location: request.nextUrl.searchParams.get("location") ?? "" });
  await rateLimit(`niches:${user.id}`, 30, 60 * 60 * 1000);
  const result = await nicheAvailability(db, user.id, location, deps);
  const response = jsonOk(result);
  // Lets the browser reuse the answer while the user flips between cities.
  response.headers.set("cache-control", "private, max-age=300");
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleNicheAvailability(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
