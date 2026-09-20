import type { PrismaClient } from "@pitchmyweb/db";
import type { VerificationStatus } from "./verify-website.js";

// One verification job, end to end: load -> verify -> write status. Direct
// Prisma write (no HTTP callback into apps/api) — this is a narrow,
// non-cascading update (two columns on one Business row), unlike
// apps/discovery-worker's results, which feed the dedup cascade and must go
// through apps/api's ingestBusinesses.

export type ProcessOutcome = "verified" | "skipped";

export type ProcessDeps = {
  db: PrismaClient;
  /** Bound to a shared Playwright Browser + configured timeouts in main.ts. */
  verify: (website: string) => Promise<VerificationStatus>;
  log: (level: "info" | "warn" | "error", fields: Record<string, unknown>, message: string) => void;
};

export async function processVerification(deps: ProcessDeps, businessId: string): Promise<ProcessOutcome> {
  const business = await deps.db.business.findUnique({ where: { id: businessId }, select: { id: true, website: true } });
  if (!business || !business.website) {
    deps.log("info", { businessId }, "verification skipped (business gone or has no website)");
    return "skipped";
  }

  const status = await deps.verify(business.website);

  await deps.db.business.update({
    where: { id: businessId },
    data: { websiteVerificationStatus: status, websiteVerifiedAt: new Date() },
  });
  deps.log("info", { businessId, status }, "website verified");
  return "verified";
}
