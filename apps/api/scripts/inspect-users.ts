import { prisma } from "../src/lib/db/client.js";

async function main() {
  const campaign = await prisma.campaign.findUnique({
    where: { id: "cmu722d7m0009bsikeqko4u4h" },
    include: { user: true }
  });
  console.log("Campaign user:", { id: campaign?.user.id, email: campaign?.user.email });

  const accounts = await prisma.whatsAppAccount.findMany({
    include: { user: true }
  });
  console.log("WhatsApp accounts:", accounts.map(a => ({
    id: a.id,
    userId: a.userId,
    userEmail: a.user?.email,
    phoneNumber: a.phoneNumber,
    status: a.status,
    lastConnectedAt: a.lastConnectedAt
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
