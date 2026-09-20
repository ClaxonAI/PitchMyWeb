import { prisma } from "../src/lib/db/client.js";

async function main() {
  // Check all WhatsApp messages created after the retry (14:57 onwards)
  const msgs = await prisma.whatsAppMessage.findMany({
    where: {
      createdAt: { gte: new Date("2026-09-18T09:27:00.000Z") }, // after 14:57 IST (~09:27 UTC)
    },
    include: {
      account: { select: { id: true, phoneNumber: true, userId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total messages after retry: ${msgs.length}\n`);

  for (const m of msgs) {
    console.log(
      `${m.id} | status=${m.status} | account=${m.account?.phoneNumber} (${m.account?.id})`
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
