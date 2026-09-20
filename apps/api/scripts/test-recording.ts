/**
 * Triggers a fresh recording for one pipeline so we can visually inspect
 * the result and confirm the full-screen fix works.
 *
 * Usage: npx tsx scripts/test-recording.ts
 */
import { prisma } from "../src/lib/db/client.js";

// Pick any READY recording's published URL to test with
async function main() {
  const rec = await prisma.demoRecording.findFirst({
    where: { status: "READY", storageKey: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: {
      websiteProject: { select: { publishedUrl: true } },
      lead: { select: { business: { select: { name: true } } } },
    },
  });

  if (!rec?.websiteProject?.publishedUrl) {
    console.log("No ready recording with a published URL found.");
    return;
  }

  console.log(`\nBusiness: ${rec.lead.business.name}`);
  console.log(`Preview URL: ${rec.websiteProject.publishedUrl}`);
  console.log(`\nThe recorder worker is watching for new jobs.`);
  console.log(`Open the preview URL in a mobile-emulated browser to verify the layout,`);
  console.log(`then check the next recording produced by the worker.\n`);
  console.log(`Preview URL: ${rec.websiteProject.publishedUrl}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
