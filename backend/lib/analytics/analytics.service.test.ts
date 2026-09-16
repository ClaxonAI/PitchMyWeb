import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { createCampaign } from "../campaigns/campaign.service";
import { ingestBusinessAsLead, applyLeadAnalysis } from "../leads/lead.service";
import { transitionLeadStatus } from "../leads/lifecycle";
import { calculateOpportunityScore } from "../scoring/scoring";
import type { BusinessProviderInput } from "../validation/business";
import type { Business, LeadStatus, ServiceCode } from "../../generated/prisma/client";
import { getAnalyticsForUser } from "./analytics.service";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "analytics-service-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.business.deleteMany({ where: { source: "demo", externalId: { startsWith: EXTERNAL_ID_PREFIX } } });
  await prisma.$disconnect();
});

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  return user;
}

let providerSeq = 0;
async function newLead(campaignId: string, category = "Dental Clinic") {
  providerSeq += 1;
  const providerInput: BusinessProviderInput = {
    name: `Test Business ${providerSeq}`,
    category,
    address: "12 MG Road",
    city: "Chennai",
    phone: "+91-9800000001",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.5,
    reviewCount: 50,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
  };
  const { business, lead } = await ingestBusinessAsLead(prisma, { campaignId, providerInput });
  return { business, lead };
}

/** Runs applyLeadAnalysis (NEW -> ANALYZED) with a deterministic score. */
async function analyze(leadId: string, business: Business, recommendedService: ServiceCode, estimatedDealMin: number, estimatedDealMax: number) {
  const score = calculateOpportunityScore(business);
  await applyLeadAnalysis(prisma, { leadId, score, recommendedService, estimatedDealMin, estimatedDealMax });
}

// Every transition from ANALYZED up to `target`, walked in one call — the
// lifecycle graph is strictly linear past ANALYZED (LOST aside), so a lead
// advanced to e.g. NEGOTIATING necessarily also passes through, and
// records the Activity for, SITE_READY/PITCHED/REPLIED/INTERESTED first.
const CHAIN: LeadStatus[] = ["SITE_READY", "PITCHED", "REPLIED", "INTERESTED", "NEGOTIATING", "WON"];
async function advanceTo(leadId: string, target: LeadStatus) {
  const idx = CHAIN.indexOf(target);
  for (let i = 0; i <= idx; i += 1) {
    await transitionLeadStatus(prisma, { leadId, nextStatus: CHAIN[i] });
  }
}

describe("getAnalyticsForUser (real DB, mixed-stage fixture)", () => {
  it("computes every top-level metric, funnel stage, and breakdown from a realistic mixed-stage fixture", async () => {
    const user = await authedUser("mixed");
    const campaignA = await createCampaign(prisma, user.id, { name: "Campaign A", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 50 });
    const campaignB = await createCampaign(prisma, user.id, { name: "Campaign B", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 50 });

    // "found" funnel stage: raw discovery count, independent of how many
    // of those businesses actually became leads.
    await prisma.campaignExecution.create({ data: { campaignId: campaignA.id, businessesFound: 25, leadsCreated: 8, status: "COMPLETED" } });

    // depth0: stays NEW — never analyzed.
    await newLead(campaignA.id);

    // depth1: ANALYZED only — never reaches SITE_READY.
    const depth1 = await newLead(campaignA.id);
    await analyze(depth1.lead.id, depth1.business, "SEO", 5000, 8000);

    // depth2: SITE_READY (WEBSITE_GENERATED fires), no pitch generated.
    const depth2 = await newLead(campaignA.id);
    await analyze(depth2.lead.id, depth2.business, "WEBSITE", 5000, 8000);
    await advanceTo(depth2.lead.id, "SITE_READY");

    // depth3: PITCHED via the lifecycle transition, but deliberately with
    // NO separate PITCH_GENERATED activity — proves `pitches`
    // (PITCH_GENERATED count) and `funnel.pitched` (PITCHED count) are
    // genuinely independent metrics, not aliases of each other.
    const depth3 = await newLead(campaignA.id);
    await analyze(depth3.lead.id, depth3.business, "SEO", 5000, 8000);
    await advanceTo(depth3.lead.id, "PITCHED");

    // depth4: REPLIED, with a real PITCH_GENERATED activity recorded.
    const depth4 = await newLead(campaignA.id);
    await analyze(depth4.lead.id, depth4.business, "WEBSITE", 5000, 8000);
    await prisma.activity.create({ data: { leadId: depth4.lead.id, type: "PITCH_GENERATED" } });
    await advanceTo(depth4.lead.id, "REPLIED");

    // depth5: INTERESTED.
    const depth5 = await newLead(campaignA.id);
    await analyze(depth5.lead.id, depth5.business, "SEO", 5000, 8000);
    await prisma.activity.create({ data: { leadId: depth5.lead.id, type: "PITCH_GENERATED" } });
    await advanceTo(depth5.lead.id, "INTERESTED");

    // depth6: NEGOTIATING — creates an open Deal seeded from estimatedDealMax=12345.
    const depth6 = await newLead(campaignA.id);
    await analyze(depth6.lead.id, depth6.business, "WEBSITE", 5000, 12345);
    await prisma.activity.create({ data: { leadId: depth6.lead.id, type: "PITCH_GENERATED" } });
    await advanceTo(depth6.lead.id, "NEGOTIATING");

    // depth7: WON — its Deal (value=99999) is excluded from pipelineValue.
    const depth7 = await newLead(campaignA.id);
    await analyze(depth7.lead.id, depth7.business, "WEBSITE", 5000, 99999);
    await prisma.activity.create({ data: { leadId: depth7.lead.id, type: "PITCH_GENERATED" } });
    await advanceTo(depth7.lead.id, "WON");

    // lostEarly: reaches PITCHED, then LOST before ever negotiating — no Deal is ever created for it.
    const lostEarly = await newLead(campaignA.id);
    await analyze(lostEarly.lead.id, lostEarly.business, "SEO", 5000, 8000);
    await advanceTo(lostEarly.lead.id, "PITCHED");
    await transitionLeadStatus(prisma, { leadId: lostEarly.lead.id, nextStatus: "LOST" });

    // lostAfterNegotiating: reaches NEGOTIATING (Deal created, value=5555) then LOST — Deal flips to LOST, excluded from pipelineValue.
    const lostAfterNegotiating = await newLead(campaignA.id);
    await analyze(lostAfterNegotiating.lead.id, lostAfterNegotiating.business, "WEBSITE", 5000, 5555);
    await advanceTo(lostAfterNegotiating.lead.id, "NEGOTIATING");
    await transitionLeadStatus(prisma, { leadId: lostAfterNegotiating.lead.id, nextStatus: "LOST" });

    // Second campaign: 2 more untouched (NEW) leads, to prove
    // breakdown-by-campaign actually groups per campaign instead of
    // collapsing everything into one bucket.
    await newLead(campaignB.id);
    await newLead(campaignB.id);

    const summary = await getAnalyticsForUser(prisma, user.id);

    // Top-level metrics
    expect(summary.totalBusinesses).toBe(12);
    expect(summary.qualifiedLeads).toBe(12);
    expect(summary.demosGenerated).toBe(8); // depth2..depth7 + lostEarly + lostAfterNegotiating all reached SITE_READY
    expect(summary.pitches).toBe(4); // PITCH_GENERATED recorded only for depth4, depth5, depth6, depth7
    expect(summary.replies).toBe(5); // depth4..depth7 (4) + lostAfterNegotiating, which passes through REPLIED en route to NEGOTIATING
    expect(summary.interested).toBe(4); // depth5..depth7 (3) + lostAfterNegotiating
    expect(summary.won).toBe(1); // depth7 only
    expect(summary.pipelineValue).toBe(12345); // only depth6's open NEGOTIATING deal counts

    // Funnel
    expect(summary.funnel.found).toBe(25);
    expect(summary.funnel.qualified).toBe(12);
    expect(summary.funnel.analyzed).toBe(9); // depth1..depth7 (7) + lostEarly + lostAfterNegotiating
    expect(summary.funnel.demo).toBe(summary.demosGenerated);
    expect(summary.funnel.pitched).toBe(7); // depth3..depth7 (5) + lostEarly + lostAfterNegotiating reached the PITCHED transition
    expect(summary.funnel.replied).toBe(summary.replies);
    expect(summary.funnel.interested).toBe(summary.interested);
    expect(summary.funnel.won).toBe(summary.won);

    // pitches (4) must be strictly less than funnel.pitched (7): proves the
    // two are genuinely independent metrics with different definitions.
    expect(summary.pitches).toBeLessThan(summary.funnel.pitched);

    // Breakdowns
    const byCampaign = Object.fromEntries(summary.breakdown.byCampaign.map((r) => [r.campaignId, r]));
    expect(byCampaign[campaignA.id]?.leadCount).toBe(10);
    expect(byCampaign[campaignA.id]?.campaignName).toBe("Campaign A");
    expect(byCampaign[campaignB.id]?.leadCount).toBe(2);
    expect(byCampaign[campaignB.id]?.campaignName).toBe("Campaign B");

    const byService = Object.fromEntries(summary.breakdown.byRecommendedService.map((r) => [r.recommendedService, r.leadCount]));
    expect(byService.WEBSITE).toBe(5); // depth2, depth4, depth6, depth7, lostAfterNegotiating
    expect(byService.SEO).toBe(4); // depth1, depth3, depth5, lostEarly
    expect((byService.WEBSITE ?? 0) + (byService.SEO ?? 0)).toBe(summary.funnel.analyzed);

    const byCategory = summary.breakdown.byCategory.find((r) => r.category === "Dental Clinic");
    expect(byCategory?.businessCount).toBe(12);
  }, 30000);

  it("returns all-zero metrics and an empty breakdown for a user with no campaigns or leads", async () => {
    const user = await authedUser("empty");
    const summary = await getAnalyticsForUser(prisma, user.id);

    expect(summary).toEqual({
      totalBusinesses: 0,
      qualifiedLeads: 0,
      demosGenerated: 0,
      pitches: 0,
      replies: 0,
      interested: 0,
      won: 0,
      pipelineValue: 0,
      funnel: { found: 0, qualified: 0, analyzed: 0, demo: 0, pitched: 0, replied: 0, interested: 0, won: 0 },
      breakdown: { byCampaign: [], byRecommendedService: [], byCategory: [] },
    });
  });

  it("never includes another user's businesses, leads, activities, deals, or campaign executions (cross-user isolation)", async () => {
    const userA = await authedUser("iso-a");
    const userB = await authedUser("iso-b");

    const campaignA = await createCampaign(prisma, userA.id, { name: "Iso A", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
    const campaignB = await createCampaign(prisma, userB.id, { name: "Iso B", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });

    await prisma.campaignExecution.create({ data: { campaignId: campaignA.id, businessesFound: 40, status: "COMPLETED" } });
    await prisma.campaignExecution.create({ data: { campaignId: campaignB.id, businessesFound: 7, status: "COMPLETED" } });

    const a1 = await newLead(campaignA.id);
    await analyze(a1.lead.id, a1.business, "WEBSITE", 1000, 2000);
    await advanceTo(a1.lead.id, "NEGOTIATING");

    const b1 = await newLead(campaignB.id);
    await analyze(b1.lead.id, b1.business, "WEBSITE", 1000, 9000);
    await advanceTo(b1.lead.id, "WON");

    const summaryA = await getAnalyticsForUser(prisma, userA.id);
    const summaryB = await getAnalyticsForUser(prisma, userB.id);

    expect(summaryA.totalBusinesses).toBe(1);
    expect(summaryA.qualifiedLeads).toBe(1);
    expect(summaryA.funnel.found).toBe(40);
    expect(summaryA.pipelineValue).toBe(2000);
    expect(summaryA.won).toBe(0);

    expect(summaryB.totalBusinesses).toBe(1);
    expect(summaryB.qualifiedLeads).toBe(1);
    expect(summaryB.funnel.found).toBe(7);
    expect(summaryB.pipelineValue).toBe(0); // b1's deal is WON, excluded from pipeline
    expect(summaryB.won).toBe(1);

    expect(summaryA.breakdown.byCampaign.some((r) => r.campaignId === campaignB.id)).toBe(false);
    expect(summaryB.breakdown.byCampaign.some((r) => r.campaignId === campaignA.id)).toBe(false);
  }, 20000);

  it("pipelineValue sums only OPEN/NEGOTIATING deals, excluding WON and LOST", async () => {
    const user = await authedUser("pipeline");
    const campaign = await createCampaign(prisma, user.id, { name: "Pipeline Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });

    const negotiating = await newLead(campaign.id);
    await analyze(negotiating.lead.id, negotiating.business, "WEBSITE", 100, 1000);
    await advanceTo(negotiating.lead.id, "NEGOTIATING");

    const won = await newLead(campaign.id);
    await analyze(won.lead.id, won.business, "WEBSITE", 100, 2000);
    await advanceTo(won.lead.id, "WON");

    const lost = await newLead(campaign.id);
    await analyze(lost.lead.id, lost.business, "WEBSITE", 100, 3000);
    await advanceTo(lost.lead.id, "NEGOTIATING");
    await transitionLeadStatus(prisma, { leadId: lost.lead.id, nextStatus: "LOST" });

    const summary = await getAnalyticsForUser(prisma, user.id);
    expect(summary.pipelineValue).toBe(1000);
  }, 20000);
});
