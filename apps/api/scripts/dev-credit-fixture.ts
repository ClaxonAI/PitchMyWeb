// Local-only scratch fixture: a signed-in user with pitch credits, a
// PROCESSING campaign, and a handful of pitchable leads, for driving the
// credit/batch UI by hand in a browser. Prints a session token to paste as
// the pmw_session cookie.
//
// Never run this against anything but a development database — it creates a
// real (if throwaway) account and hands out a working session.
//
//   npx tsx scripts/dev-credit-fixture.ts

import { prisma } from "../src/lib/db/client";
import { createSession, SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { createCampaign } from "../src/lib/campaigns/campaign.service";
import { ensureFreeGrant, grantCredits } from "../src/lib/checkout/wallet.service";
import { ingestBusinessAsLead } from "../src/lib/leads/lead.service";

if (process.env.NODE_ENV === "production") {
  throw new Error("dev-credit-fixture is a development helper and must not run against production");
}

const stamp = Date.now();
const email = `credit-ui-${stamp}@example.test`;

const user = await prisma.user.create({ data: { email, name: "Credit UI Demo" } });
await ensureFreeGrant(prisma, user.id);
await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:dev-${stamp}` });

const campaign = await createCampaign(prisma, user.id, {
  name: "Credit UI Demo Campaign",
  location: "Chennai",
  category: "Dental Clinic",
  websiteRequirement: "ANY",
  leadLimit: 50,
  targetCount: 12,
});
await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PROCESSING" } });

for (let i = 0; i < 6; i += 1) {
  await ingestBusinessAsLead(prisma, {
    campaignId: campaign.id,
    providerInput: {
      name: `Credit UI Business ${stamp}-${i}`,
      category: "Dental Clinic",
      address: `${i + 1} MG Road`,
      city: "Chennai",
      // One landline on purpose, so the "can't be pitched" path is visible.
      phone: i === 5 ? "+91 44 2345 6789" : `+91-9${String(stamp).slice(-8)}${i}`,
      email: null,
      website: null,
      instagram: null,
      facebook: null,
      rating: 4.5,
      reviewCount: 120,
      latitude: null,
      longitude: null,
      source: "demo",
      externalId: `dev-credit-ui-${stamp}-${i}`,
    },
  });
}

const session = await createSession(prisma, user.id);
console.log(JSON.stringify({ email, userId: user.id, campaignId: campaign.id, cookie: `${SESSION_COOKIE_NAME}=${session.token}` }, null, 2));
await prisma.$disconnect();
