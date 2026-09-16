import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Reuse a single PrismaClient/pool across hot reloads in dev instead of
// exhausting Postgres connections on every module reload.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  // node-postgres defaults a Pool to 10 connections. Vitest runs test
  // files concurrently in separate worker processes, each importing this
  // module fresh (the globalThis cache above only dedupes within one
  // process) — with enough files in flight at once that default was
  // enough to approach Postgres's own max_connections (100), causing
  // sporadic full-suite timeouts under load (queries queueing for a free
  // connection, not a real bug in the query itself). A small explicit cap
  // keeps any one process's footprint bounded, in production as well as
  // in tests, without changing query/transaction behavior.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
