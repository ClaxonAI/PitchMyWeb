import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import type { Redis } from "ioredis";
import { prisma } from "../../../lib/db/client";
import { redisClient } from "../../../lib/api/rate-limit";

// GET /api/health — for the deploy's health gate (infrastructure/aws/
// bootstrap.sh) and an external uptime monitor. 200 when the database and
// Redis both answer, 503 otherwise. Says which, never how (no hosts, no
// error text).

export const dynamic = "force-dynamic";

function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

async function check(name: string, work: () => Promise<unknown>): Promise<[string, boolean]> {
  try {
    await within(2000, work());
    return [name, true];
  } catch {
    return [name, false];
  }
}

export async function handleHealth(db: PrismaClient, redis: Pick<Redis, "ping">): Promise<NextResponse> {
  const results = Object.fromEntries(await Promise.all([check("database", () => db.$queryRaw`SELECT 1`), check("redis", () => redis.ping())]));
  const ok = Object.values(results).every(Boolean);
  return NextResponse.json({ ok, ...results }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<NextResponse> {
  return handleHealth(prisma, redisClient());
}
