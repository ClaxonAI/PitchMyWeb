import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueIndianPhone } from "../testing/db-test-helpers";
import { createCampaign } from "./campaign.service";
import { autoSelectLeads, selectLeads } from "./selection.service";
import { getOrCreateWallet, grantCredits } from "../checkout/wallet.service";
import { ingestBusinessAsLead } from "../leads/lead.service";
import type { CampaignCreateInput } from "../validation/campaign";
import type { BusinessProviderInput } from "../validation/business";

// Exact-count reservation (rules 6/7/20/21 of the pitch-credits plan):
// selectLeads/autoSelectLeads must never create more LeadPipeline rows —
// or reserve more credits — than the campaign's targetCount and the
// caller's wallet both allow, and a request for more leads than are
// actually eligible must reserve only what was actually claimed.

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "selection-service-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

const baseCampaignInput: CampaignCreateInput = {
  name: "Selection Service Test",
  location: "Chennai",
  category: "Dental Clinic",
  websiteRequirement: "ANY",
  leadLimit: 200,
};

let providerSeq = 0;
function providerInput(overrides: Partial<BusinessProviderInput> = {}): BusinessProviderInput {
  providerSeq += 1;
  return {
    name: `Test Business ${providerSeq}`,
    category: "Dental Clinic",
    address: null,
    city: "Chennai",
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
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

/** A campaign in PROCESSING with `leadCount` selectable leads, no discovery run needed. */
async function processingCampaignWithLeads(prefix: string, leadCount: number, overrides: Partial<CampaignCreateInput> = {}) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, { ...baseCampaignInput, targetCount: 200, ...overrides });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PROCESSING" } });
  for (let i = 0; i < leadCount; i += 1) {
    await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
  }
  const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
  return { user, campaign, leads };
}

describe("selectLeads reservation", () => {
  it("reserves exactly the requested count, no more", async () => {
    const { user, campaign, leads } = await processingCampaignWithLeads("select-exact", 5, { targetCount: 5 });
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    const { started } = await selectLeads(prisma, user.id, campaign.id, leads.slice(0, 3).map((l) => l.id));

    expect(started).toHaveLength(3);
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 17, reservedCredits: 3 });

    const batch = await prisma.pitchBatch.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(batch).toMatchObject({ requestedCount: 3, reservedCount: 3, mode: "MANUAL" });
    expect(started.every((p) => p.batchId === batch.id)).toBe(true);
  });

  it("throws INSUFFICIENT_PITCH_CREDITS and reserves nothing when the wallet can't cover the request", async () => {
    const { user, campaign, leads } = await processingCampaignWithLeads("select-insufficient", 3, { targetCount: 5 });
    await grantCredits(prisma, { userId: user.id, amount: 2, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    await expect(selectLeads(prisma, user.id, campaign.id, leads.map((l) => l.id))).rejects.toMatchObject({
      code: "INSUFFICIENT_PITCH_CREDITS",
      details: { available: 2, requested: 3 },
    });

    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 2, reservedCredits: 0 });
    const batchCount = await prisma.pitchBatch.count({ where: { campaignId: campaign.id } });
    expect(batchCount).toBe(0);
  });
});

describe("autoSelectLeads reservation", () => {
  it("reserves and creates exactly `count` pipelines when eligible leads exceed it", async () => {
    const { user, campaign } = await processingCampaignWithLeads("auto-count", 8, { targetCount: 20 });
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    const { started } = await autoSelectLeads(prisma, campaign.id, { count: 3 });

    expect(started).toHaveLength(3);
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 17, reservedCredits: 3 });
  });

  // The core "20 credits, request 15, only 11 eligible -> reserve only 11"
  // behavior: reserving an upper bound and releasing the shortfall once the
  // real eligible count is known, rather than either over-reserving or
  // failing the whole request.
  it("releases the shortfall when fewer eligible leads exist than requested", async () => {
    const { user, campaign } = await processingCampaignWithLeads("auto-shortfall", 11, { targetCount: 20 });
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    const { started } = await autoSelectLeads(prisma, campaign.id, { count: 15 });

    expect(started).toHaveLength(11);
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 9, reservedCredits: 11 });

    const batch = await prisma.pitchBatch.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(batch).toMatchObject({ requestedCount: 15, reservedCount: 11, mode: "AUTO" });

    const releaseLedger = await prisma.pitchCreditLedger.findFirst({ where: { userId: user.id, type: "RELEASE" } });
    expect(releaseLedger?.amount).toBe(4);
  });

  it("never reserves or creates more than the campaign's remaining targetCount slots", async () => {
    const { user, campaign } = await processingCampaignWithLeads("auto-target-cap", 10, { targetCount: 4 });
    await grantCredits(prisma, { userId: user.id, amount: 100, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    // Ask for far more than the campaign's own targetCount allows.
    const { started } = await autoSelectLeads(prisma, campaign.id, { count: 10 });

    expect(started).toHaveLength(4);
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 96, reservedCredits: 4 });
  });

  it("completes an empty batch immediately and refunds in full when nothing is eligible", async () => {
    const user = await createTestUser("auto-nothing-eligible");
    createdUserIds.push(user.id);
    const campaign = await createCampaign(prisma, user.id, { ...baseCampaignInput, targetCount: 5 });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PROCESSING" } });
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    const { started } = await autoSelectLeads(prisma, campaign.id, { count: 3 });

    expect(started).toHaveLength(0);
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 20, reservedCredits: 0 });

    const batch = await prisma.pitchBatch.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(batch).toMatchObject({ requestedCount: 3, reservedCount: 0, status: "COMPLETED" });
    expect(batch.completedAt).not.toBeNull();
  });

  it("is a no-op that creates no batch when there are no remaining slots to fill", async () => {
    const { user, campaign } = await processingCampaignWithLeads("auto-no-slots", 3, { targetCount: 1 });
    await grantCredits(prisma, { userId: user.id, amount: 20, type: "PURCHASE", referenceId: `purchase:${user.id}` });

    // Fill the campaign's one slot first, so a second call has zero left.
    const first = await autoSelectLeads(prisma, campaign.id, { count: 1 });
    expect(first.started).toHaveLength(1);

    const { started } = await autoSelectLeads(prisma, campaign.id, { count: 5 });

    expect(started).toHaveLength(0);
    const batchCount = await prisma.pitchBatch.count({ where: { campaignId: campaign.id } });
    expect(batchCount).toBe(1); // only the first call's batch — the second created none
    const wallet = await getOrCreateWallet(prisma, user.id);
    expect(wallet).toMatchObject({ availableCredits: 19, reservedCredits: 1 });
  });
});
