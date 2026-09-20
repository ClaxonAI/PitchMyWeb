import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createCampaign } from "../campaigns/campaign.service";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { PaymentRequiredError, ValidationError } from "../errors";
import {
  FREE_PITCH_ALLOWANCE,
  assertFreePitchBudget,
  assertMarketAllowed,
  assertPaidDiscoveryAllowed,
  getAllowedMarkets,
  getFreePitchesRemaining,
  isPaidDiscoveryRequired,
  userCanDiscover,
} from "./paid-access";

const createdUserIds: string[] = [];
const createdBusinessIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
  await prisma.$disconnect();
});

describe("isPaidDiscoveryRequired", () => {
  it("is off under Vitest unless REQUIRE_PAID_FOR_DISCOVERY_IN_TESTS is set", () => {
    expect(isPaidDiscoveryRequired({ VITEST: "true", REQUIRE_PAID_FOR_DISCOVERY: "true" })).toBe(false);
    expect(isPaidDiscoveryRequired({ VITEST: "true", REQUIRE_PAID_FOR_DISCOVERY_IN_TESTS: "true" })).toBe(true);
  });

  it("is on in development by default", () => {
    expect(isPaidDiscoveryRequired({ NODE_ENV: "development" })).toBe(true);
    expect(isPaidDiscoveryRequired({ NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "false" })).toBe(false);
  });
});

describe("free pitch allowance", () => {
  const gated = { NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "true", VITEST: "false" };

  it("gives unpaid users the full free allowance before any campaign runs", async () => {
    const user = await createTestUser("free-pitch-fresh");
    createdUserIds.push(user.id);
    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBe(FREE_PITCH_ALLOWANCE);
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(true);
    await expect(assertPaidDiscoveryAllowed(prisma, user.id, gated)).resolves.toBeUndefined();
    await expect(assertFreePitchBudget(prisma, user.id, FREE_PITCH_ALLOWANCE, gated)).resolves.toBeUndefined();
  });

  it("rejects requests larger than remaining free pitches", async () => {
    const user = await createTestUser("free-pitch-over");
    createdUserIds.push(user.id);
    await expect(assertFreePitchBudget(prisma, user.id, FREE_PITCH_ALLOWANCE + 1, gated)).rejects.toThrow(ValidationError);
  });

  it("blocks discovery after free pitches are consumed", async () => {
    const user = await createTestUser("free-pitch-spent");
    createdUserIds.push(user.id);
    const campaign = await createCampaign(prisma, user.id, {
      name: "Free Spent",
      location: "Chennai",
      category: "Dental Clinic",
      websiteRequirement: "ANY",
      leadLimit: 20,
      targetCount: FREE_PITCH_ALLOWANCE,
    });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED" } });

    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBe(0);
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(false);
    await expect(assertPaidDiscoveryAllowed(prisma, user.id, gated)).rejects.toThrow(PaymentRequiredError);
  });

  async function spentCampaign(label: string, status: "RUNNING" | "COMPLETED" | "FAILED", stages: Array<"FAILED" | "SENT">) {
    const user = await createTestUser(label);
    createdUserIds.push(user.id);
    const campaign = await createCampaign(prisma, user.id, {
      name: label,
      location: "Chennai",
      category: "Dental Clinic",
      websiteRequirement: "ANY",
      leadLimit: 20,
      targetCount: 4,
    });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status } });
    for (const [index, stage] of stages.entries()) {
      const business = await prisma.business.create({ data: { name: `${label}-${index}`, category: "Dental Clinic", source: "test", externalId: `${label}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } as never });
      createdBusinessIds.push(business.id);
      const lead = await prisma.lead.create({ data: { campaignId: campaign.id, businessId: business.id } as never });
      await prisma.leadPipeline.create({ data: { campaignId: campaign.id, leadId: lead.id, stage } });
    }
    return user;
  }

  it("refunds failed pitches while a campaign is still running", async () => {
    const user = await spentCampaign("refund-running", "RUNNING", ["FAILED", "FAILED", "SENT"]);
    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBe(FREE_PITCH_ALLOWANCE - 2);
  });

  it("refunds failed pitches after a campaign completes", async () => {
    const user = await spentCampaign("refund-completed", "COMPLETED", ["FAILED", "SENT", "SENT", "SENT"]);
    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBe(FREE_PITCH_ALLOWANCE - 3);
  });

  it("refunds everything that did not go through when the campaign fails", async () => {
    const user = await spentCampaign("refund-failed", "FAILED", ["SENT", "FAILED"]);
    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBe(FREE_PITCH_ALLOWANCE - 1);
  });

  it("treats planId as paid access with no free-budget cap", async () => {
    const user = await createTestUser("free-pitch-paid");
    createdUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { planId: "auto" } });
    expect(await getFreePitchesRemaining(prisma, user.id, gated)).toBeNull();
    expect(await userCanDiscover(prisma, user.id, gated)).toBe(true);
    await expect(assertFreePitchBudget(prisma, user.id, 50, gated)).resolves.toBeUndefined();
  });
});

describe("market entitlements", () => {
  const gated = { NODE_ENV: "development", REQUIRE_PAID_FOR_DISCOVERY: "true", VITEST: "false" };

  async function createPaidOrder(userId: string, market: "india" | "foreign") {
    return prisma.order.create({
      data: {
        userId,
        planId: "auto",
        market,
        amount: market === "india" ? 14900 : 280,
        currency: market === "india" ? "INR" : "USD",
        status: "PAID",
        razorpayOrderId: `test_${userId}_${market}`,
        razorpayPaymentId: `pay_${userId}_${market}`,
        razorpaySignature: "test",
      },
    });
  }

  it("allows only the market purchased", async () => {
    const indiaUser = await createTestUser("market-india");
    const foreignUser = await createTestUser("market-foreign");
    createdUserIds.push(indiaUser.id, foreignUser.id);
    await createPaidOrder(indiaUser.id, "india");
    await createPaidOrder(foreignUser.id, "foreign");

    expect(await getAllowedMarkets(prisma, indiaUser.id, gated)).toEqual(["india"]);
    expect(await getAllowedMarkets(prisma, foreignUser.id, gated)).toEqual(["foreign"]);
    await expect(assertMarketAllowed(prisma, indiaUser.id, "foreign", gated)).rejects.toThrow(ValidationError);
    await expect(assertMarketAllowed(prisma, foreignUser.id, "india", gated)).rejects.toThrow(ValidationError);
  });

  it("unlocks both markets after both market purchases", async () => {
    const user = await createTestUser("market-both");
    createdUserIds.push(user.id);
    await createPaidOrder(user.id, "india");
    await createPaidOrder(user.id, "foreign");

    expect((await getAllowedMarkets(prisma, user.id, gated)).sort()).toEqual(["foreign", "india"]);
    await expect(assertMarketAllowed(prisma, user.id, "india", gated)).resolves.toBeUndefined();
    await expect(assertMarketAllowed(prisma, user.id, "foreign", gated)).resolves.toBeUndefined();
  });
});