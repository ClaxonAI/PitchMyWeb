import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueIndianPhone } from "../testing/db-test-helpers";
import { createCampaign } from "../campaigns/campaign.service";
import { listCampaignLeads, selectLeads } from "../campaigns/selection.service";
import { ingestBusinesses } from "../campaigns/run.service";
import { getOrCreateWallet, grantCredits } from "../checkout/wallet.service";
import { ingestBusinessAsLead } from "./lead.service";
import type { BusinessProviderInput } from "../validation/business";
import type { CampaignCreateInput } from "../validation/campaign";
import {
  EXCLUSIVE_DAYS,
  businessesTakenByOthers,
  confirmBusinessClaim,
  excludedExternalIds,
  releaseBusinessClaim,
  reserveBusiness,
} from "./claims.service";

// Business exclusivity: once one user pitches a business, no other user is
// shown it, can select it, or can claim it, for 90 days.

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "claims-test-";
const DAY = 24 * 60 * 60 * 1000;

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

const campaignInput: CampaignCreateInput = {
  name: "Claims Test",
  location: "Chennai",
  category: "Dental Clinic",
  websiteRequirement: "ANY",
  leadLimit: 50,
  targetCount: 5,
};

let seq = 0;
function providerInput(): BusinessProviderInput {
  seq += 1;
  return {
    name: `Claims Test Clinic ${Date.now()}-${seq}`,
    category: "Dental Clinic",
    address: null,
    city: "Chennai",
    phone: uniqueIndianPhone(),
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.5,
    reviewCount: 30,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

async function userWithCampaign(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, campaignInput);
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PROCESSING" } });
  return { user, campaign };
}

async function businessFor(campaignId: string, input = providerInput()) {
  const { business, lead } = await ingestBusinessAsLead(prisma, { campaignId, providerInput: input });
  return { business, lead, input };
}

describe("reserveBusiness", () => {
  it("gives a business to exactly one of two users racing for it", async () => {
    const a = await userWithCampaign("claim-race-a");
    const b = await userWithCampaign("claim-race-b");
    const { business } = await businessFor(a.campaign.id);

    const results = await Promise.all([
      reserveBusiness(prisma, { businessId: business.id, userId: a.user.id, campaignId: a.campaign.id }),
      reserveBusiness(prisma, { businessId: business.id, userId: b.user.id, campaignId: b.campaign.id }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("lets the holder claim it again, and nobody else", async () => {
    const a = await userWithCampaign("claim-own-a");
    const b = await userWithCampaign("claim-own-b");
    const { business } = await businessFor(a.campaign.id);

    expect(await reserveBusiness(prisma, { businessId: business.id, userId: a.user.id, campaignId: a.campaign.id })).toBe(true);
    expect(await reserveBusiness(prisma, { businessId: business.id, userId: a.user.id, campaignId: a.campaign.id })).toBe(true);
    expect(await reserveBusiness(prisma, { businessId: business.id, userId: b.user.id, campaignId: b.campaign.id })).toBe(false);
  });

  it("frees the business when the pitch never went out", async () => {
    const a = await userWithCampaign("claim-release-a");
    const b = await userWithCampaign("claim-release-b");
    const { business } = await businessFor(a.campaign.id);

    await reserveBusiness(prisma, { businessId: business.id, userId: a.user.id, campaignId: a.campaign.id });
    await releaseBusinessClaim(prisma, { businessId: business.id, userId: a.user.id, campaignId: a.campaign.id });
    expect(await reserveBusiness(prisma, { businessId: business.id, userId: b.user.id, campaignId: b.campaign.id })).toBe(true);
  });

  it("a sent pitch holds the business for 90 days, then it is free again", async () => {
    const a = await userWithCampaign("claim-90-a");
    const b = await userWithCampaign("claim-90-b");
    const { business } = await businessFor(a.campaign.id);

    await reserveBusiness(prisma, { businessId: business.id, userId: a.user.id, campaignId: a.campaign.id });
    await confirmBusinessClaim(prisma, { businessId: business.id, userId: a.user.id });
    const claim = await prisma.businessClaim.findUniqueOrThrow({ where: { businessId: business.id } });
    expect(claim.status).toBe("PITCHED");
    expect(claim.expiresAt.getTime()).toBeGreaterThan(Date.now() + (EXCLUSIVE_DAYS - 1) * DAY);

    // Releasing a sent pitch's claim is a no-op: it stays theirs.
    await releaseBusinessClaim(prisma, { businessId: business.id, userId: a.user.id, campaignId: a.campaign.id });
    expect(await reserveBusiness(prisma, { businessId: business.id, userId: b.user.id, campaignId: b.campaign.id })).toBe(false);
    expect(await businessesTakenByOthers(prisma, b.user.id, [business.id])).toEqual(new Set([business.id]));
    expect(await businessesTakenByOthers(prisma, a.user.id, [business.id])).toEqual(new Set());

    const later = new Date(Date.now() + (EXCLUSIVE_DAYS + 1) * DAY);
    expect(await businessesTakenByOthers(prisma, b.user.id, [business.id], later)).toEqual(new Set());
    expect(await reserveBusiness(prisma, { businessId: business.id, userId: b.user.id, campaignId: b.campaign.id, now: later })).toBe(true);
  });
});

describe("two users, same niche, same city", () => {
  it("the second user never gets the business the first is pitching", async () => {
    const a = await userWithCampaign("same-niche-a");
    const b = await userWithCampaign("same-niche-b");
    const { lead: leadA, business, input } = await businessFor(a.campaign.id);

    // A pitches it.
    await grantCredits(prisma, { userId: a.user.id, amount: 5, type: "PURCHASE", referenceId: `purchase:${a.user.id}` });
    const { started } = await selectLeads(prisma, a.user.id, a.campaign.id, [leadA.id]);
    expect(started).toHaveLength(1);
    expect((await prisma.businessClaim.findUniqueOrThrow({ where: { businessId: business.id } })).userId).toBe(a.user.id);

    // B's search finds the same place: it is not kept as a lead.
    const bCampaign = await prisma.campaign.findUniqueOrThrow({ where: { id: b.campaign.id } });
    const other = providerInput();
    const result = await ingestBusinesses(prisma, bCampaign, "exec-claims-test", [input, other]);
    expect(result.leadsCreated).toBe(1);
    const bLeads = await prisma.lead.findMany({ where: { campaignId: b.campaign.id }, select: { businessId: true } });
    expect(bLeads.map((l) => l.businessId)).not.toContain(business.id);

    // The discovery worker is told to skip it in the first place.
    await prisma.business.update({ where: { id: business.id }, data: { city: "Chennai" } });
    const skip = await excludedExternalIds(prisma, { userId: b.user.id, source: "demo", location: "chennai" });
    expect(skip).toContain(input.externalId);
  });

  it("a lead B already had becomes 'taken' and cannot be selected", async () => {
    const a = await userWithCampaign("taken-a");
    const b = await userWithCampaign("taken-b");
    const input = providerInput();
    const { lead: leadA, business } = await businessFor(a.campaign.id, input);
    // B found it before A pitched it.
    const { lead: leadB } = await businessFor(b.campaign.id, input);
    expect(leadB.businessId).toBe(business.id);

    await grantCredits(prisma, { userId: a.user.id, amount: 5, type: "PURCHASE", referenceId: `purchase:${a.user.id}` });
    await selectLeads(prisma, a.user.id, a.campaign.id, [leadA.id]);

    const rows = await listCampaignLeads(prisma, b.user.id, b.campaign.id);
    const row = rows.items.find((item) => item.id === leadB.id)!;
    expect(row.selectable).toBe(false);
    expect(row.blockedReason).toBe("taken");

    // Even asked directly, nothing starts and no credit is spent.
    await grantCredits(prisma, { userId: b.user.id, amount: 5, type: "PURCHASE", referenceId: `purchase:${b.user.id}` });
    await expect(selectLeads(prisma, b.user.id, b.campaign.id, [leadB.id])).rejects.toThrow();
    expect(await getOrCreateWallet(prisma, b.user.id)).toMatchObject({ availableCredits: 5, reservedCredits: 0 });
    expect(await prisma.leadPipeline.count({ where: { campaignId: b.campaign.id } })).toBe(0);
  });
});
