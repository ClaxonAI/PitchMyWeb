// One-shot CLI for cron-style schedulers (Kubernetes CronJob, crontab, a
// platform "cron service"). Exits 0 on success, 1 on failure.
//
//   npm run job:expire-stale-runs -w apps/api
//
// Reads DATABASE_URL (and ASYNC_EXECUTION_TIMEOUT_MINUTES) from the
// environment, falling back to apps/api/.env like the API itself.
import { prisma } from "../src/lib/db/client";
import { runExpireStaleRunsJob } from "../src/lib/jobs/expire-stale-runs.job";

try {
  const result = await runExpireStaleRunsJob(prisma);
  console.log(`expired ${result.expired} stale run(s) in ${result.durationMs}ms`);
  process.exitCode = 0;
} catch (error) {
  console.error("expire-stale-runs failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
