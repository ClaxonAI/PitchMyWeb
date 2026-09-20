import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@pitchmyweb/db";
import pino from "pino";
import { getConfig } from "./config.js";

let client: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg({ connectionString: getConfig().DATABASE_URL, max: 4 });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "verification-worker" },
  ...(process.env.NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
});

/** Error text safe for logs: first line, bounded. */
export function sanitizeError(error: unknown, fallback = "Unexpected error"): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  return (message.split("\n")[0] ?? fallback).slice(0, 200);
}
