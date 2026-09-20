import { prisma } from "../src/lib/db/client.js";

async function main() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 2,
    include: {
      pipelines: {
        include: {
          lead: { include: { business: true } },
        },
      },
    },
  });

  for (const c of campaigns) {
    console.log(`\n=== Campaign: ${c.id} "${c.name}", status: ${c.status}, mode: ${c.deliveryMode} ===`);
    const stages: Record<string, number> = {};
    for (const p of c.pipelines) {
      stages[p.stage] = (stages[p.stage] || 0) + 1;
      const rec = p.recordingId ? await prisma.demoRecording.findUnique({ where: { id: p.recordingId } }) : null;
      const msg = p.whatsappMessageId ? await prisma.whatsAppMessage.findUnique({ where: { id: p.whatsappMessageId } }) : null;
      if (p.stage === "FAILED") {
        console.log(`  FAILED: "${p.lead.business.name}" | failStage: ${p.failureStage} | reason: ${p.failureReason} | phone: ${p.lead.business.phone}`);
      } else if (p.stage === "RECORDING") {
        console.log(`  RECORDING: "${p.lead.business.name}" | recStatus: ${rec?.status} | attempts: ${rec?.attempts} | recFail: ${rec?.failureReason}`);
      } else {
        console.log(`  ${p.stage}: "${p.lead.business.name}" | waStatus: ${msg?.status} | phone: ${p.lead.business.phone}`);
      }
    }
    console.log(`\n  Stage distribution:`, JSON.stringify(stages, null, 2));
  }

  const accounts = await prisma.whatsAppAccount.findMany();
  console.log("\nWhatsApp accounts:", JSON.stringify(accounts.map(a => ({ id: a.id, phoneNumber: a.phoneNumber, status: a.status, lastError: a.lastError })), null, 2));

  const queuedMessages = await prisma.whatsAppMessage.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, failureReason: true, phoneNumber: true, mediaKind: true, mediaStorageKey: true, createdAt: true }
  });
  console.log("\nRecent WhatsApp messages:", JSON.stringify(queuedMessages, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
