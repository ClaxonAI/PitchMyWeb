import { prisma } from "../src/lib/db/client.js";

async function main() {
  const pipelines = await prisma.leadPipeline.findMany({
    where: { campaignId: "cmu722d7m0009bsikeqko4u4h" },
    include: {
      lead: { include: { business: true } },
    }
  });

  for (const p of pipelines) {
    const rec = p.recordingId ? await prisma.demoRecording.findUnique({ where: { id: p.recordingId } }) : null;
    console.log(`Pipeline ${p.id}: stage=${p.stage}, failStage=${p.failureStage}, reason=${p.failureReason}, recStatus=${rec?.status}, storageKey=${rec?.storageKey}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
