import { prisma } from "../src/lib/db/client.js";

async function main() {
  const rec = await prisma.demoRecording.findFirst({
    where: { status: "READY", storageKey: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: {
      websiteProject: { select: { publishedUrl: true } },
      lead: { select: { campaignId: true } },
    },
  });

  console.log("storageKey:", rec?.storageKey);
  console.log("posterKey:", rec?.posterKey);
  console.log("publishedUrl:", rec?.websiteProject?.publishedUrl);
  console.log("durationMs:", rec?.durationMs);
  console.log("sizeBytes:", rec?.sizeBytes);
}

main().catch(console.error).finally(() => prisma.$disconnect());
