// One-shot script: gives accounts that bought before the credit system
// existed the credits they paid for (lib/checkout/legacy-credit-backfill.ts
// explains both populations and why it is safe to re-run).
//
// Run it as part of the release that switches credit enforcement on. Until it
// runs, a customer who paid for the old "unlimited" plans has nothing in their
// wallet but the free grant.
//
//   npm run job:backfill-pitch-credits -w apps/api -- --dry-run
//   npm run job:backfill-pitch-credits -w apps/api

import { prisma } from "../src/lib/db/client";
import { backfillLegacyPitchCredits } from "../src/lib/checkout/legacy-credit-backfill";

const dryRun = process.argv.includes("--dry-run");

try {
  const result = await backfillLegacyPitchCredits(prisma, { dryRun });
  console.log(
    [
      dryRun ? "DRY RUN — nothing was written." : "Applied.",
      `orders filled in: ${result.ordersFilled} (${result.orderCreditsGranted} credits granted)`,
      `admin-assigned plans: ${result.plansGranted} (${result.planCreditsGranted} credits granted)`,
    ].join("\n"),
  );
  for (const skipped of result.skipped) {
    console.warn(`skipped ${skipped.kind} ${skipped.id}: ${skipped.reason}`);
  }
  process.exitCode = 0;
} catch (error) {
  console.error("backfill-pitch-credits failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
