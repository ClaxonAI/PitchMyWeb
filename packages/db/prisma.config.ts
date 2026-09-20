import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// The database has exactly one env file in this monorepo: apps/api/.env.
// Prisma commands run with packages/db as their cwd, so `dotenv/config`
// alone would look in the wrong place. A real DATABASE_URL already in the
// environment (CI, docker, `DATABASE_URL=... npm run db:migrate`) always
// wins; the file is only a fallback for local development.
const packageRoot = path.dirname(fileURLToPath(import.meta.url));

loadEnv();
if (!process.env["DATABASE_URL"]) {
  loadEnv({ path: path.resolve(packageRoot, "../../apps/api/.env") });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
