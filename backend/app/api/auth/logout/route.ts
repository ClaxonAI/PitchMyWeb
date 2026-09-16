import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "../../../../generated/prisma/client";
import { prisma } from "../../../../lib/db/client";
import { SESSION_COOKIE_NAME, deleteSessionByToken } from "../../../../lib/auth/session";
import { errorResponse, jsonOk } from "../../../../lib/api/response";

export async function handleLogout(db: PrismaClient, request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await deleteSessionByToken(db, token);
  }

  const response = jsonOk({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleLogout(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
