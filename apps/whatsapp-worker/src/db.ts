import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@pitchmyweb/db";
import { getConfig } from "./config.js";

// The worker is a long-lived process with a handful of concurrent jobs, so
// it needs one client and one small pool — not the per-request singleton
// dance apps/api does for Next's hot reloads.
let client: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (!client) {
    const config = getConfig();
    const adapter = new PrismaPg({ connectionString: config.DATABASE_URL, max: 5 });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
