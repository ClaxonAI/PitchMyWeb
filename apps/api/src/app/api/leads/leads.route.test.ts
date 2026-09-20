import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueIndianPhone } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError, NotFoundError, InvalidLeadTransitionError } from "../../../lib/errors";
import { ZodError } from "zod";
import { createCampaign } from "../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead } from "../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../lib/validation/business";
import { handleListLeads } from "./route";
import { handleGetLead, handlePatchLead } from "./[id]/route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "leads-route-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  // See lead.service.test.ts: Business rows created here outlive the test
  // users that indirectly created them (Lead -> Business is onDelete:
  // Restrict), so they need their own cleanup.
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const session = await createSession(prisma, user.id);
  return { user, cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` };
}

function req(url: string, init: { method?: string; body?: unknown; cookieHeader?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.cookieHeader) headers.cookie = init.cookieHeader;
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

let providerSeq = 0;
function providerInput(overrides: Partial<BusinessProviderInput> = {}): BusinessProviderInput {
  providerSeq += 1;
  return {
    name: `Route Test Business ${providerSeq}`,
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
  const campaign = await createCampaign(prisma, user.id, { name: "Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
  return { user, cookieHeader, campaign, lead };
}

describe("GET /api/leads", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleListLeads(prisma, req("http://localhost/api/leads"))).rejects.toThrow(UnauthenticatedError);
  });

  it("only lists leads belonging to the authenticated user's own campaigns", async () => {
    const { cookieHeader, lead } = await newUserWithLead("list-mine");
    await newUserWithLead("list-other");

    const response = await handleListLeads(prisma, req("http://localhost/api/leads", { cookieHeader }));
    const body = await response.json();
    expect(body.items.map((l: { id: string }) => l.id)).toEqual([lead.id]);
  });

  it("rejects an invalid query (minScore > maxScore)", async () => {
    const { cookieHeader } = await authedUser("list-invalid-query");
    await expect(handleListLeads(prisma, req("http://localhost/api/leads?minScore=80&maxScore=20", { cookieHeader }))).rejects.toThrow(ZodError);
  });
});

describe("GET /api/leads/:id", () => {
  it("returns the full detail payload for the owner", async () => {
    const { cookieHeader, lead } = await newUserWithLead("detail-mine");
    const response = await handleGetLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { cookieHeader }), { id: lead.id });
    const body = await response.json();
    expect(body.id).toBe(lead.id);
    expect(body.business).toBeDefined();
    expect(body.activities.some((a: { type: string }) => a.type === "LEAD_CREATED")).toBe(true);
  });

  it("returns NotFoundError for another user's lead (no data leakage)", async () => {
    const { lead } = await newUserWithLead("detail-owner");
    const { cookieHeader: otherCookie } = await authedUser("detail-other");
    await expect(handleGetLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { cookieHeader: otherCookie }), { id: lead.id })).rejects.toThrow(NotFoundError);
  });
});

describe("PATCH /api/leads/:id", () => {
  it("performs a valid lifecycle transition through transitionLeadStatus and records the mapped Activity", async () => {
    const { cookieHeader, lead } = await newUserWithLead("patch-valid");
    const response = await handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "ANALYZED" }, cookieHeader }), { id: lead.id });
    const body = await response.json();
    expect(body.status).toBe("ANALYZED");

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "LEAD_ANALYZED")).toBe(true);
  });

  // Phase 4 code-review finding #11: GET and PATCH used to return different
  // shapes for the same resource (PATCH returned only the bare Lead row).
  it("returns the same full detail shape as GET, not just the bare Lead row", async () => {
    const { cookieHeader, lead } = await newUserWithLead("patch-shape");
    const patchResponse = await handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "ANALYZED" }, cookieHeader }), { id: lead.id });
    const patchBody = await patchResponse.json();

    const getResponse = await handleGetLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { cookieHeader }), { id: lead.id });
    const getBody = await getResponse.json();

    for (const key of ["business", "campaign", "scores", "activities", "websiteProjects", "pitches", "outreach", "deal"]) {
      expect(patchBody).toHaveProperty(key);
    }
    expect(Object.keys(patchBody).sort()).toEqual(Object.keys(getBody).sort());
    expect(patchBody.status).toBe("ANALYZED");
  });

  it("rejects an illegal transition (NEW -> WON) without mutating the lead or creating an activity", async () => {
    const { cookieHeader, lead } = await newUserWithLead("patch-invalid");

    await expect(handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "WON" }, cookieHeader }), { id: lead.id })).rejects.toThrow(
      InvalidLeadTransitionError,
    );

    const current = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(current?.status).toBe("NEW");
    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "WON")).toBe(false);
  });

  it("rejects a body attempting to set score/recommendedService directly", async () => {
    const { cookieHeader, lead } = await newUserWithLead("patch-injection");
    await expect(
      handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "ANALYZED", score: 100 }, cookieHeader }), { id: lead.id }),
    ).rejects.toThrow(ZodError);
  });

  it("rejects a PATCH on another user's lead before ever attempting a transition", async () => {
    const { lead } = await newUserWithLead("patch-owner");
    const { cookieHeader: otherCookie } = await authedUser("patch-other");

    await expect(
      handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "ANALYZED" }, cookieHeader: otherCookie }), { id: lead.id }),
    ).rejects.toThrow(NotFoundError);

    const current = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(current?.status).toBe("NEW");
  });
});

// Phase 7 section 1/12: "implement an explicit operator confirmation
// action for PITCHED." The existing generic PATCH /api/leads/:id endpoint
// already satisfies every requirement of that action — it authenticates,
// authorizes, validates input, calls transitionLeadStatus() (never writing
// status directly), transitions SITE_READY -> PITCHED (a transition that
// already existed in the Phase 3 lifecycle graph), and creates the PITCHED
// Activity through the existing activity mechanism (ACTIVITY_FOR_LEAD_STATUS
// already maps PITCHED -> "PITCHED"). No new endpoint was built for this;
// these tests prove the existing one already does the job for this
// specific case, per the explicit instruction to reuse an existing
// mechanism rather than duplicate it.
describe("PATCH /api/leads/:id — explicit PITCHED confirmation (tests 25, 26, 27, 28)", () => {
  it("confirms PITCHED via transitionLeadStatus() and creates the PITCHED Activity", async () => {
    const { cookieHeader, lead } = await newUserWithLead("pitched-confirm");

    await handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "ANALYZED" }, cookieHeader }), { id: lead.id });
    await handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "SITE_READY" }, cookieHeader }), { id: lead.id });
    const response = await handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "PITCHED" }, cookieHeader }), { id: lead.id });

    const body = await response.json();
    expect(body.status).toBe("PITCHED");

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.filter((a) => a.type === "PITCHED")).toHaveLength(1);
  });

  it("rejects confirming PITCHED from an ineligible status (NEW), without mutating the lead or creating the Activity", async () => {
    const { cookieHeader, lead } = await newUserWithLead("pitched-invalid");

    await expect(handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "PITCHED" }, cookieHeader }), { id: lead.id })).rejects.toThrow(
      InvalidLeadTransitionError,
    );

    const current = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(current?.status).toBe("NEW");
    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "PITCHED")).toBe(false);
  });

  it("rejects another user confirming PITCHED on a lead they don't own", async () => {
    const { cookieHeader, lead } = await newUserWithLead("pitched-owner-a");
    const { cookieHeader: otherCookie } = await authedUser("pitched-owner-b");
    await handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "ANALYZED" }, cookieHeader }), { id: lead.id });
    await handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "SITE_READY" }, cookieHeader }), { id: lead.id });

    await expect(
      handlePatchLead(prisma, req(`http://localhost/api/leads/${lead.id}`, { method: "PATCH", body: { status: "PITCHED" }, cookieHeader: otherCookie }), { id: lead.id }),
    ).rejects.toThrow(NotFoundError);

    const current = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(current?.status).toBe("SITE_READY");
  });
});
