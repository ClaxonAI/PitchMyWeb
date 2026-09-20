// One-shot CLI for cron-style schedulers (Kubernetes CronJob, crontab, a
// platform "cron service"). Exits 0 on success, 1 on failure.
//
//   npm run job:enqueue-website-verifications -w apps/api
//
// Reads DATABASE_URL/REDIS_URL from the environment, falling back to
// apps/api/.env like the API itself.
import { prisma } from "../src/lib/db/client";
import { runEnqueueWebsiteVerificationsJob } from "../src/lib/jobs/enqueue-website-verifications.job";
import { enqueueWebsiteVerification } from "../src/lib/pipeline/website-verification-queue";

try {
  const result = await runEnqueueWebsiteVerificationsJob(prisma, (businessId) => enqueueWebsiteVerification({ businessId }));
  console.log(`enqueued ${result.enqueued} website verification(s) in ${result.durationMs}ms`);
  process.exitCode = 0;
} catch (error) {
  console.error("enqueue-website-verifications failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
