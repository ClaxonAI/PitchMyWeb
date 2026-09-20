import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../../../../../lib/db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueBusinessName, uniqueIndianPhone } from "../../../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { NotFoundError, UnauthenticatedError } from "../../../../../lib/errors";
import { createCampaign } from "../../../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead, applyLeadAnalysis } from "../../../../../lib/leads/lead.service";
import { calculateOpportunityScore } from "../../../../../lib/scoring/scoring";
import { createWebsiteProject } from "../../../../../lib/websites/website.service";
import type { BusinessProviderInput } from "../../../../../lib/validation/business";
import type { TemplateContent } from "../../../../../lib/validation/website";
import { handleGenerateDemo } from "./route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "demo-route-test-";
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

function req(url: string, body: unknown, cookieHeader?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

let providerSeq = 0;
async function newLead(prefix: string) {
  const { user, cookieHeader } = await authedUser(prefix);
  const campaign = await createCampaign(prisma, user.id, { name: "Demo Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  providerSeq += 1;
  const providerInput: BusinessProviderInput = {
    // Phase 2 dedup engine: unique name/phone so this business doesn't
    // tier-2/tier-4 match another concurrently-running test file's
    // identically-fixtured business.
    name: uniqueBusinessName("Lakshmi Dental Care"),
    category: "Dental Clinic",
    address: "12 MG Road",
    city: "Chennai",
    phone: uniqueIndianPhone(),
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
  const { business, lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  return { user, cookieHeader, lead, business };
}

const validContent: TemplateContent = {
  template: "clinic-modern",
  businessName: "Lakshmi Dental Care",
  theme: "clean",
  hero: { headline: "Trusted Dental Care", subheadline: "Modern dental care in Chennai.", cta: "Book Appointment" },
  services: ["Dental Implants", "Teeth Cleaning"],
  contact: { phone: "+91-9800000001", address: "Chennai" },
};

describe("POST /api/leads/:id/demo", () => {
  it("rejects an unauthenticated request", async () => {
    const { lead } = await newLead("unauth");
    await expect(handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { contentJSON: validContent }), { id: lead.id })).rejects.toThrow(UnauthenticatedError);
  });

  it("returns NotFoundError for another user's lead (no data leakage), and creates nothing", async () => {
    const { lead } = await newLead("owner-a");
    const { cookieHeader: otherCookie } = await authedUser("owner-b");
    await expect(
      handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { contentJSON: validContent }, otherCookie), { id: lead.id }),
    ).rejects.toThrow(NotFoundError);
    const projects = await prisma.websiteProject.findMany({ where: { leadId: lead.id } });
    expect(projects).toHaveLength(0);
  });

  it("returns NotFoundError for a nonexistent lead", async () => {
    const { cookieHeader } = await authedUser("missing-lead");
    await expect(
      handleGenerateDemo(prisma, req("http://localhost/api/leads/does-not-exist/demo", { contentJSON: validContent }, cookieHeader), { id: "does-not-exist" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects invalid content (unknown template) with a ZodError, creating nothing", async () => {
    const { cookieHeader, lead } = await newLead("invalid-content");
    await expect(
      handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { contentJSON: { ...validContent, template: "not-a-real-template" } }, cookieHeader), { id: lead.id }),
    ).rejects.toThrow(ZodError);
    const projects = await prisma.websiteProject.findMany({ where: { leadId: lead.id } });
    expect(projects).toHaveLength(0);
  });

  it("rejects a body that still carries leadId (path id is authoritative, not a client-supplied body field)", async () => {
    const { cookieHeader, lead } = await newLead("leadid-in-body");
    await expect(
      handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { leadId: lead.id, contentJSON: validContent }, cookieHeader), { id: lead.id }),
    ).rejects.toThrow(ZodError);
  });

  it("creates a WebsiteProject with an initial WebsiteVersion on success (test: successful demo creation, correct persistence)", async () => {
    const { cookieHeader, lead } = await newLead("success");
    const response = await handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { contentJSON: validContent }, cookieHeader), { id: lead.id });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.leadId).toBe(lead.id);
    expect(body.status).toBe("DRAFT");
    expect(body.slug).toBeTruthy();
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0].versionNumber).toBe(1);

    const projects = await prisma.websiteProject.findMany({ where: { leadId: lead.id } });
    expect(projects).toHaveLength(1);
    const versions = await prisma.websiteVersion.findMany({ where: { websiteProjectId: projects[0]!.id } });
    expect(versions).toHaveLength(1);
  });

  it("transitions an ANALYZED lead to SITE_READY and records WEBSITE_GENERATED (correct lifecycle/activity behavior)", async () => {
    const { cookieHeader, lead, business } = await newLead("lifecycle");
    const score = calculateOpportunityScore(business);
    await applyLeadAnalysis(prisma, { leadId: lead.id, score, recommendedService: "WEBSITE", estimatedDealMin: 1000, estimatedDealMax: 2000 });

    const response = await handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { contentJSON: validContent }, cookieHeader), { id: lead.id });
    expect(response.status).toBe(201);

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead?.status).toBe("SITE_READY");

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id, type: "WEBSITE_GENERATED" } });
    expect(activities).toHaveLength(1);
  });

  it("does not transition a NEW lead's status (NEW -> SITE_READY is not a legal transition), but still records WEBSITE_GENERATED", async () => {
    const { cookieHeader, lead } = await newLead("new-lead-status");
    await handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { contentJSON: validContent }, cookieHeader), { id: lead.id });

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead?.status).toBe("NEW");

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id, type: "WEBSITE_GENERATED" } });
    expect(activities).toHaveLength(1);
  });

  it("produces the exact same persisted result shape as POST /api/websites for equivalent input (existing website-generation behavior remains intact)", async () => {
    const { user, cookieHeader, lead } = await newLead("equivalence-demo");
    const { lead: lead2 } = await (async () => {
      const campaign = await createCampaign(prisma, user.id, { name: "Equivalence Campaign 2", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
      providerSeq += 1;
      const { lead: lead2 } = await ingestBusinessAsLead(prisma, {
        campaignId: campaign.id,
        providerInput: {
          name: "Lakshmi Dental Care 2",
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
        },
      });
      return { lead: lead2 };
    })();

    const viaWebsitesApi = await createWebsiteProject(prisma, user.id, { leadId: lead2.id, contentJSON: validContent });
    const response = await handleGenerateDemo(prisma, req(`http://localhost/api/leads/${lead.id}/demo`, { contentJSON: validContent }, cookieHeader), { id: lead.id });
    const viaDemoApi = await response.json();

    expect(viaDemoApi.status).toBe(viaWebsitesApi.status);
    expect(viaDemoApi.template).toBe(viaWebsitesApi.template);
    expect(viaDemoApi.versions).toHaveLength(viaWebsitesApi.versions.length);
    expect(viaDemoApi.versions[0].contentJSON).toEqual(viaWebsitesApi.versions[0]!.contentJSON);
  });
});
