// The single entry point every app imports the database through
// (`import { PrismaClient, type Lead } from "@pitchmyweb/db"`).
//
// This package deliberately ships TypeScript source rather than a compiled
// `dist/`: Prisma's `prisma-client` generator emits extensionless relative
// imports (`from "./enums"`), which plain `tsc` output cannot resolve under
// Node's ESM resolver. Every consumer already runs the code through a
// transformer that handles those specifiers — Next via `transpilePackages`,
// the worker and the seed script via `tsx`, the test suites via Vite — so
// exporting source is both simpler and the only variant that actually runs.
export * from "./generated/prisma/client";
