import { prisma } from "../src/lib/db/client.js";
import { retryPipeline } from "../src/lib/pipeline/pipeline.service.js";

async function main() {
  const campaignId = "cmu722d7m0009bsikeqko4u4h";

  // Load the campaign to get the userId
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { user: true },
  });

  console.log(`Campaign user: ${campaign.user.email} (${campaign.user.id})`);

  // Find all FAILED pipelines
  const failedPipelines = await prisma.leadPipeline.findMany({
    where: { campaignId, stage: "FAILED" },
    include: { lead: { include: { business: true } } },
  });

  console.log(`Found ${failedPipelines.length} failed pipelines. Retrying...`);

  let succeeded = 0;
  let errored = 0;

  for (const pipeline of failedPipelines) {
    try {
      const result = await retryPipeline(prisma, campaign.userId, pipeline.id);
      console.log(`✅ Retried "${pipeline.lead.business.name}" → stage: ${result.stage}`);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ Failed to retry "${pipeline.lead.business.name}": ${msg}`);
      errored++;
    }
  }

  console.log(`\nDone: ${succeeded} retried, ${errored} errors.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
