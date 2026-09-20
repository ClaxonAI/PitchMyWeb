import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError } from "../../../lib/errors";
import { createCampaign } from "../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead, persistGeneratedPitch } from "../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../lib/validation/business";
import { handleListPitches } from "./route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "pitches-route-test-";
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
    name: `Pitches Route Test Business ${providerSeq}`,
    category: "Dental Clinic",
    address: null,
    city: "Chennai",
    phone: "+91-9800000000",
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

async function newUserWithPitch(prefix: string) {
  const { user, cookieHeader } = await authedUser(prefix);
  const campaign = await createCampaign(prisma, user.id, { name: "Pitches Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
  const pitch = await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Hello from a test pitch", promptVersion: "test-v1", modelName: "test-model" });
  return { user, cookieHeader, campaign, lead, pitch };
}

describe("GET /api/pitches", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleListPitches(prisma, req("http://localhost/api/pitches"))).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the generated pitch with its lead's business, most-recent-first", async () => {
    const { cookieHeader, pitch } = await newUserWithPitch("list-mine");
    const response = await handleListPitches(prisma, req("http://localhost/api/pitches", { cookieHeader }));
    const body = await response.json();
    expect(body.items.some((p: { id: string }) => p.id === pitch.id)).toBe(true);
    expect(body.items[0]?.lead?.business).toBeDefined();
  });

  it("only returns pitches belonging to the authenticated user's own campaigns", async () => {
    const { cookieHeader, pitch } = await newUserWithPitch("list-owner");
    await newUserWithPitch("list-other");

    const response = await handleListPitches(prisma, req("http://localhost/api/pitches", { cookieHeader }));
    const body = await response.json();
    expect(body.items.every((p: { id: string }) => p.id === pitch.id)).toBe(true);
  });

  it("filters by status", async () => {
    const { cookieHeader } = await newUserWithPitch("list-status");
    const response = await handleListPitches(prisma, req("http://localhost/api/pitches?status=GENERATED", { cookieHeader }));
    const body = await response.json();
    expect(body.items.every((p: { status: string }) => p.status === "GENERATED")).toBe(true);

    const noneResponse = await handleListPitches(prisma, req("http://localhost/api/pitches?status=FAILED", { cookieHeader }));
    expect((await noneResponse.json()).items).toHaveLength(0);
  });

  it("rejects an invalid query (bad status enum value)", async () => {
    const { cookieHeader } = await authedUser("list-invalid-query");
    await expect(handleListPitches(prisma, req("http://localhost/api/pitches?status=NOT_A_STATUS", { cookieHeader }))).rejects.toThrow(ZodError);
  });
});
