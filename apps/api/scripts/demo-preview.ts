// Creates a fictional dental-clinic lead and publishes its preview site through
// the real pipeline build step, then prints the preview URL. Local development
// only; the data is clearly fake (".example" domains, reserved phone range).
//
//   npm run demo:preview -w apps/api              publish a preview
//   npm run demo:preview -w apps/api -- --record  also queue a recording
//                                                  (needs npm run dev:recorder)
//
// Requires the database (npm run infra:up) and SITES_PUBLIC_URL; view the
// result with `npm run dev:sites`.
import { prisma } from "../src/lib/db/client";
import { hashPassword } from "../src/lib/auth/password";
import { createCampaign, markCampaignReady } from "../src/lib/campaigns/campaign.service";
import { applyDiscoveryInsights, ingestBusinessAsLead } from "../src/lib/leads/lead.service";
import { buildAndPublish, requestRecording } from "../src/lib/pipeline/pipeline.service";
import { recordingQueue } from "../src/lib/pipeline/recording-queue";

const DEMO_EMAIL = "demo-preview@pitchmyweb.example";

async function main() {
  const user =
    (await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })) ??
    (await prisma.user.create({ data: { email: DEMO_EMAIL, passwordHash: await hashPassword(`demo-${Date.now()}-preview`) } }));

  const campaign = await createCampaign(prisma, user.id, {
    name: "Demo preview",
    location: "Chennai",
    category: "Dental Clinic",
    websiteRequirement: "WITHOUT_WEBSITE",
    targetCount: 1,
    deliveryMode: "DIRECT",
  });
  await markCampaignReady(prisma, user.id, campaign.id);
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED" } });

  const suffix = Date.now().toString().slice(-4);
  const { lead, business } = await ingestBusinessAsLead(prisma, {
    campaignId: campaign.id,
    providerInput: {
      name: "Lotus Smile Dental Studio",
      category: "Dental Clinic",
      address: "14, 2nd Avenue, Anna Nagar, Chennai 600040",
      city: "Anna Nagar, Chennai",
      phone: `+91 90000 0${suffix}`,
      rating: 4.8,
      reviewCount: 312,
      latitude: 13.085,
      longitude: 80.21,
      source: "demo-preview",
      externalId: `demo-preview-${Date.now()}`,
    },
  });
  await applyDiscoveryInsights(prisma, {
    lead,
    business,
    insights: {
      summary:
        "Lotus Smile Dental Studio is a family dental practice in Anna Nagar, known for gentle check-ups, clear treatment plans and a calm clinic for children and adults.",
      services: ["Teeth cleaning and check-ups", "Root canal treatment", "Clear aligners and braces", "Dental implants", "Teeth whitening", "Kids dentistry"],
      outreachMessage: "Hi Lotus Smile team! I designed a sample website for your clinic: {{site_link}} Would you like it to go live?",
      model: "demo",
    },
  });

  const pipeline = await prisma.leadPipeline.create({ data: { campaignId: campaign.id, leadId: lead.id } });
  const ok = await buildAndPublish(prisma, pipeline.id);
  const row = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
  if (!ok || !row.websiteProjectId) throw new Error(`Build failed: ${row.failureReason}`);
  const project = await prisma.websiteProject.findUniqueOrThrow({ where: { id: row.websiteProjectId } });
  console.log(`Preview published: ${project.publishedUrl}`);
  console.log(`Pipeline: ${pipeline.id}  Lead: ${lead.id}`);

  if (process.argv.includes("--record")) {
    const queued = await requestRecording(prisma, pipeline.id);
    const after = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    console.log(queued ? `Recording queued: ${after.recordingId}` : `Recording request failed: ${after.failureReason}`);
    await recordingQueue().close();
  }
}

try {
  await main();
} catch (error) {
  console.error("demo-preview failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  // The queue's Redis connection would otherwise keep the process alive.
  process.exit(process.exitCode ?? 0);
}
