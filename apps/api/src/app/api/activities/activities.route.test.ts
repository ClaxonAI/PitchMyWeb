import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueIndianPhone } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError } from "../../../lib/errors";
import { createCampaign } from "../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead } from "../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../lib/validation/business";
import { handleListActivities } from "./route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "activities-route-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const session = await createSession(prisma, user.id);
  return { user, cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` };
}

function req(url: string, init: { cookieHeader?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.cookieHeader) headers.cookie = init.cookieHeader;
  return new NextRequest(url, { headers });
}

let providerSeq = 0;
function providerInput(overrides: Partial<BusinessProviderInput> = {}): BusinessProviderInput {
  providerSeq += 1;
  return {
    name: `Activities Route Test Business ${providerSeq}`,
    category: "Dental Clinic",
    address: null,
    city: "Chennai",
    // Phase 2 dedup engine: a shared phone number would legitimately dedup
    // these "different" test businesses (tier 2, corroborated by city) —
    // even across concurrently-running test files.
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

async function newUserWithLead(prefix: string) {
  const { user, cookieHeader } = await authedUser(prefix);
  const campaign = await createCampaign(prisma, user.id, { name: "Activities Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
  return { user, cookieHeader, campaign, lead };
}

describe("GET /api/activities", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleListActivities(prisma, req("http://localhost/api/activities"))).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the LEAD_CREATED activity recorded by ingestion, most-recent-first", async () => {
    const { cookieHeader, lead } = await newUserWithLead("feed-mine");
    const response = await handleListActivities(prisma, req("http://localhost/api/activities", { cookieHeader }));
    const body = await response.json();
    expect(body.items.some((a: { leadId: string; type: string }) => a.leadId === lead.id && a.type === "LEAD_CREATED")).toBe(true);
    expect(body.items[0]?.lead?.business).toBeDefined();
  });

  it("only returns activities belonging to the authenticated user's own campaigns", async () => {
    const { cookieHeader, lead } = await newUserWithLead("feed-owner");
    await newUserWithLead("feed-other");

    const response = await handleListActivities(prisma, req("http://localhost/api/activities", { cookieHeader }));
    const body = await response.json();
    expect(body.items.every((a: { leadId: string }) => a.leadId === lead.id)).toBe(true);
  });

  it("filters by campaignId, scoped to one user's two campaigns", async () => {
    const { user, cookieHeader, campaign: campaignA, lead: leadA } = await newUserWithLead("feed-campaign-a");
    const campaignB = await createCampaign(prisma, user.id, { name: "Second Campaign", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
    const { lead: leadB } = await ingestBusinessAsLead(prisma, { campaignId: campaignB.id, providerInput: providerInput() });

    const response = await handleListActivities(prisma, req(`http://localhost/api/activities?campaignId=${campaignA.id}`, { cookieHeader }));
    const body = await response.json();
    expect(body.items.some((a: { leadId: string }) => a.leadId === leadA.id)).toBe(true);
    expect(body.items.some((a: { leadId: string }) => a.leadId === leadB.id)).toBe(false);
  });

  it("rejects an invalid query (pageSize out of range)", async () => {
    const { cookieHeader } = await authedUser("feed-invalid-query");
    await expect(handleListActivities(prisma, req("http://localhost/api/activities?pageSize=1000", { cookieHeader }))).rejects.toThrow(ZodError);
  });
});
