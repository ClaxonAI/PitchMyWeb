import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../lib/db/client";
import { requireCurrentUser } from "../../../../lib/auth/current-user";
import { parseJsonBody } from "../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../lib/api/response";
import { changePassword } from "../../../../lib/users/me.service";
import { changePasswordSchema } from "../../../../lib/validation/me";
import { clientIp, rateLimit } from "../../../../lib/api/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

// POST /api/me/password: reauthenticate with the current password before
// accepting a new one. Rate-limited the same way login/register are — a
// password-guessing endpoint deserves the same protection, checked before
// the bcrypt-comparison work so a limited caller doesn't get a "free"
// expensive request either.
export async function handleChangePassword(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser(db, request);
  await rateLimit(`change-password:user:${user.id}`, 10, WINDOW_MS);
  await rateLimit(`change-password:ip:${clientIp(request)}`, 20, WINDOW_MS);

  const body = await parseJsonBody(request, changePasswordSchema);
  await changePassword(db, user.id, body);
  return jsonOk({ success: true });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleChangePassword(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
