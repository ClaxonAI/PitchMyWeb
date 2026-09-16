import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError } from "../../../lib/errors";
import { createCampaign } from "../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead } from "../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../lib/validation/business";
import { handleGetAnalytics } from "./route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "analytics-route-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.business.deleteMany({ where: { source: "demo", externalId: { startsWith: EXTERNAL_ID_PREFIX } } });
  await prisma.$disconnect();
});

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const session = await createSession(prisma, user.id);
  return { user, cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` };
}

function req(cookieHeader?: string) {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest("http://localhost/api/analytics", { method: "GET", headers });
}

let providerSeq = 0;
async function newLead(campaignId: string) {
  providerSeq += 1;
  const providerInput: BusinessProviderInput = {
    name: `Analytics Route Business ${providerSeq}`,
    category: "Dental Clinic",
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
  return ingestBusinessAsLead(prisma, { campaignId, providerInput });
}

describe("GET /api/analytics", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleGetAnalytics(prisma, req())).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the authenticated user's own summary with the documented shape", async () => {
    const { user, cookieHeader } = await authedUser("shape");
    const campaign = await createCampaign(prisma, user.id, { name: "Analytics Shape Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
    await newLead(campaign.id);

    const response = await handleGetAnalytics(prisma, req(cookieHeader));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.qualifiedLeads).toBe(1);
    expect(body.totalBusinesses).toBe(1);
    expect(typeof body.pipelineValue).toBe("number");
    expect(body.funnel).toMatchObject({ found: 0, qualified: 1, analyzed: 0, demo: 0, pitched: 0, replied: 0, interested: 0, won: 0 });
    expect(Array.isArray(body.breakdown.byCampaign)).toBe(true);
    expect(Array.isArray(body.breakdown.byRecommendedService)).toBe(true);
    expect(Array.isArray(body.breakdown.byCategory)).toBe(true);
  });

  it("never leaks another user's leads/businesses into the caller's summary (cross-user isolation)", async () => {
    const { user: userA, cookieHeader: cookieA } = await authedUser("route-iso-a");
    const { user: userB } = await authedUser("route-iso-b");

    const campaignA = await createCampaign(prisma, userA.id, { name: "Route Iso A", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
    const campaignB = await createCampaign(prisma, userB.id, { name: "Route Iso B", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });

    await newLead(campaignA.id);
    await newLead(campaignB.id);
    await newLead(campaignB.id);

    const response = await handleGetAnalytics(prisma, req(cookieA));
    const body = await response.json();

    expect(body.qualifiedLeads).toBe(1); // only userA's own lead, never userB's two
    expect(body.breakdown.byCampaign.some((r: { campaignId: string }) => r.campaignId === campaignB.id)).toBe(false);
  });
});
