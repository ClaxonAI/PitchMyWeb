import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueIndianPhone } from "../testing/db-test-helpers";
import { NotFoundError } from "../errors";
import { createCampaign } from "../campaigns/campaign.service";
import { applyLeadAnalysis, getLeadForUser, ingestBusinessAsLead, listLeadsForUser } from "./lead.service";
import type { CampaignCreateInput } from "../validation/campaign";
import type { BusinessProviderInput } from "../validation/business";
import { calculateOpportunityScore } from "../scoring/scoring";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "lead-service-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  // ingestBusinessAsLead creates canonical Business rows independent of any
  // User (Lead -> Business is onDelete: Restrict, so deleting the test
  // users above does not remove these) — clean them up too so repeated
  // test runs don't grow the businesses table indefinitely.
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

const baseCampaignInput: CampaignCreateInput = {
  name: "Lead Service Test",
  location: "Chennai",
  category: "Dental Clinic",
  websiteRequirement: "ANY",
  leadLimit: 10,
};

let providerSeq = 0;
function providerInput(overrides: Partial<BusinessProviderInput> = {}): BusinessProviderInput {
  providerSeq += 1;
  return {
    name: `Test Business ${providerSeq}`,
    category: "Dental Clinic",
    address: null,
    city: "Chennai",
    // Phase 2 dedup engine: a shared phone number across "different" test
    // businesses now legitimately dedups them (tier 2, corroborated by the
    // shared city) — give every fixture its own number, unique even across
    // concurrently-running test files, so these tests keep exercising
    // genuinely distinct businesses.
    phone: uniqueIndianPhone(),
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4,
    reviewCount: 20,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
    ...overrides,
  };
}

async function newUserWithCampaign(prefix: string, overrides: Partial<CampaignCreateInput> = {}) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, { ...baseCampaignInput, ...overrides });
  return { user, campaign };
}

describe("getLeadForUser ownership", () => {
  it("returns the full detail payload for the owning user", async () => {
    const { user, campaign } = await newUserWithCampaign("detail-owner");
    const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });

    const fetched = await getLeadForUser(prisma, user.id, lead.id);
    expect(fetched.id).toBe(lead.id);
    expect(fetched.business).toBeDefined();
    expect(fetched.campaign.id).toBe(campaign.id);
    expect(fetched.activities.some((a) => a.type === "LEAD_CREATED")).toBe(true);
  });

  it("throws NotFoundError when the lead belongs to another user's campaign", async () => {
    const { campaign } = await newUserWithCampaign("detail-owner-a");
    const { user: other } = await newUserWithCampaign("detail-owner-b");
    const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });

    await expect(getLeadForUser(prisma, other.id, lead.id)).rejects.toThrow(NotFoundError);
  });
});

// Phase 2 dedup engine, exercised through the real chokepoint
// (ingestBusinessAsLead -> resolveBusiness) against a real Postgres
// database — the fake-Prisma cascade tests in business/dedupe.test.ts prove
// the branching logic; this proves the actual production call path wires
// through to it correctly.
describe("ingestBusinessAsLead (Phase 2 dedup)", () => {
  it("flags an uncorroborated exact-phone match as a PENDING PossibleDuplicate instead of silently attaching", async () => {
    const { campaign } = await newUserWithCampaign("dedup-uncorroborated");
    const sharedPhone = "+91-9811100001";

    const { business: existing } = await ingestBusinessAsLead(prisma, {
      campaignId: campaign.id,
      providerInput: providerInput({ name: "Existing Business", city: "Chennai", phone: sharedPhone }),
    });

    // Same phone, but a different city and an unrelated name — not
    // corroborated, so this must NOT attach to `existing` and must instead
    // create a new business flagged for review.
    const { business: incoming } = await ingestBusinessAsLead(prisma, {
      campaignId: campaign.id,
      providerInput: providerInput({ name: "Totally Unrelated Business", city: "Mumbai", phone: sharedPhone }),
    });

    expect(incoming.id).not.toBe(existing.id);

    const flags = await prisma.possibleDuplicate.findMany({
      where: { OR: [{ businessId: existing.id, candidateId: incoming.id }, { businessId: incoming.id, candidateId: existing.id }] },
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]?.status).toBe("PENDING");
    expect(flags[0]?.matchedFields).toMatchObject({ flaggedVia: "EXACT_PHONE_UNCORROBORATED" });
  });
});

describe("listLeadsForUser", () => {
  it("scopes results to the user's own campaigns", async () => {
    const { user, campaign } = await newUserWithCampaign("list-owner");
    const { user: other, campaign: otherCampaign } = await newUserWithCampaign("list-other");
    await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
    await ingestBusinessAsLead(prisma, { campaignId: otherCampaign.id, providerInput: providerInput() });

    const result = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.campaignId).toBe(campaign.id);

    const otherResult = await listLeadsForUser(prisma, other.id, { page: 1, pageSize: 20 });
    expect(otherResult.total).toBe(1);
    expect(otherResult.items[0]?.campaignId).toBe(otherCampaign.id);
  });

  it("filters by campaignId", async () => {
    const { user, campaign: campaignA } = await newUserWithCampaign("filter-campaign-a");
    const campaignB = await createCampaign(prisma, user.id, baseCampaignInput);
    await ingestBusinessAsLead(prisma, { campaignId: campaignA.id, providerInput: providerInput() });
    await ingestBusinessAsLead(prisma, { campaignId: campaignB.id, providerInput: providerInput() });

    const result = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 20, campaignId: campaignA.id });
    expect(result.items.every((l) => l.campaignId === campaignA.id)).toBe(true);
    expect(result.total).toBe(1);
  });

  it("filters by status", async () => {
    const { user, campaign } = await newUserWithCampaign("filter-status");
    const { lead: leadA } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
    await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });

    const score = calculateOpportunityScore({ rating: 4, reviewCount: 20, website: null, instagram: null, facebook: null, phone: "+91-1", email: null, address: null, city: null, latitude: null, longitude: null });
    await applyLeadAnalysis(prisma, { leadId: leadA.id, score, recommendedService: "WEBSITE" });

    const analyzed = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 20, status: "ANALYZED" });
    expect(analyzed.items.map((l) => l.id)).toEqual([leadA.id]);

    const stillNew = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 20, status: "NEW" });
    expect(stillNew.items.map((l) => l.id)).not.toContain(leadA.id);
  });

  it("filters by score range", async () => {
    const { user, campaign } = await newUserWithCampaign("filter-score");
    const { lead: low } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
    const { lead: high } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });

    await applyLeadAnalysis(prisma, { leadId: low.id, score: { total: 20, classification: "IGNORE", breakdown: { rating: 0, reviewVolume: 0, websiteGap: 20, socialPresence: 0, contactAvailability: 0, businessValue: 0, localDemand: 0, dataQuality: 0 } }, recommendedService: "WEBSITE" });
    await applyLeadAnalysis(prisma, { leadId: high.id, score: { total: 90, classification: "EXCELLENT", breakdown: { rating: 15, reviewVolume: 15, websiteGap: 25, socialPresence: 10, contactAvailability: 10, businessValue: 10, localDemand: 5, dataQuality: 0 } }, recommendedService: "WEBSITE" });

    const result = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 20, minScore: 50 });
    expect(result.items.map((l) => l.id)).toEqual([high.id]);
  });

  it("filters by recommendedService", async () => {
    const { user, campaign } = await newUserWithCampaign("filter-service");
    const { lead: websiteLead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
    const { lead: whatsappLead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });

    const score = calculateOpportunityScore({ rating: 4, reviewCount: 20, website: null, instagram: null, facebook: null, phone: "+91-1", email: null, address: null, city: null, latitude: null, longitude: null });
    await applyLeadAnalysis(prisma, { leadId: websiteLead.id, score, recommendedService: "WEBSITE" });
    await applyLeadAnalysis(prisma, { leadId: whatsappLead.id, score, recommendedService: "WHATSAPP" });

    const result = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 20, recommendedService: "WHATSAPP" });
    expect(result.items.map((l) => l.id)).toEqual([whatsappLead.id]);
  });

  it("searches by business name (case-insensitive)", async () => {
    const { user, campaign } = await newUserWithCampaign("filter-search");
    const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput({ name: "Lakshmi Unique Dental Care" }) });
    await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput({ name: "Some Other Clinic" }) });

    const result = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 20, search: "unique dental" });
    expect(result.items.map((l) => l.id)).toEqual([lead.id]);
  });

  it("paginates results", async () => {
    const { user, campaign } = await newUserWithCampaign("filter-pagination");
    for (let i = 0; i < 5; i += 1) {
      await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
    }

    const page1 = await listLeadsForUser(prisma, user.id, { page: 1, pageSize: 2 });
    const page2 = await listLeadsForUser(prisma, user.id, { page: 2, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.items[0]?.id).not.toBe(page2.items[0]?.id);
  });
});
