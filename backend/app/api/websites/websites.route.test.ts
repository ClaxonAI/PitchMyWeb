import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError, NotFoundError, InvalidWebsiteTransitionError } from "../../../lib/errors";
import { ZodError } from "zod";
import { createCampaign } from "../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead } from "../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../lib/validation/business";
import type { TemplateContent } from "../../../lib/validation/website";
import { handleCreateWebsite, handleListWebsites } from "./route";
import { handleGetWebsite, handlePatchWebsite } from "./[id]/route";
import { handlePublishWebsite } from "./[id]/publish/route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "websites-route-test-";
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
async function newUserWithLead(prefix: string) {
  const { user, cookieHeader } = await authedUser(prefix);
  const campaign = await createCampaign(prisma, user.id, { name: "Websites Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  providerSeq += 1;
  const providerInput: BusinessProviderInput = {
    name: "Lakshmi Dental Care",
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
  const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  return { user, cookieHeader, lead };
}

const validContent: TemplateContent = {
  template: "clinic-modern",
  businessName: "Lakshmi Dental Care",
  theme: "clean",
  hero: { headline: "Trusted Dental Care", subheadline: "Modern dental care in Chennai.", cta: "Book Appointment" },
  services: ["Dental Implants", "Teeth Cleaning"],
  contact: { phone: "+91-9800000001", address: "Chennai" },
};

describe("POST /api/websites", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: "x", contentJSON: validContent } }))).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it("creates a website project with valid content (test 1, 4)", async () => {
    const { cookieHeader, lead } = await newUserWithLead("create");
    const response = await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.leadId).toBe(lead.id);
    expect(body.slug).toBeTruthy();
    expect(body.versions).toHaveLength(1);
  });

  it("rejects invalid website content (unknown template) with a ZodError (test 2, 13)", async () => {
    const { cookieHeader, lead } = await newUserWithLead("invalid-content");
    await expect(
      handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: { ...validContent, template: "not-a-real-template" } }, cookieHeader })),
    ).rejects.toThrow(ZodError);
  });

  it("rejects content containing HTML/script-like text (test 14)", async () => {
    const { cookieHeader, lead } = await newUserWithLead("html-rejection");
    await expect(
      handleCreateWebsite(
        prisma,
        req("http://localhost/api/websites", {
          method: "POST",
          body: { leadId: lead.id, contentJSON: { ...validContent, hero: { ...validContent.hero, headline: "<script>alert(1)</script>" } } },
          cookieHeader,
        }),
      ),
    ).rejects.toThrow(ZodError);
  });

  it("rejects creating a website for another user's lead (test 3)", async () => {
    const { lead } = await newUserWithLead("owner-a");
    const { cookieHeader: otherCookie } = await authedUser("owner-b");
    await expect(
      handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader: otherCookie })),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("GET /api/websites/:id (cross-user protection, test 10)", () => {
  it("returns the project for its owner", async () => {
    const { cookieHeader, lead } = await newUserWithLead("get-mine");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();

    const response = await handleGetWebsite(prisma, req(`http://localhost/api/websites/${created.id}`, { cookieHeader }), { id: created.id });
    expect((await response.json()).id).toBe(created.id);
  });

  it("rejects another user's GET", async () => {
    const { cookieHeader, lead } = await newUserWithLead("get-owner-a");
    const { cookieHeader: otherCookie } = await authedUser("get-owner-b");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();

    await expect(handleGetWebsite(prisma, req(`http://localhost/api/websites/${created.id}`, { cookieHeader: otherCookie }), { id: created.id })).rejects.toThrow(NotFoundError);
  });
});

describe("PATCH /api/websites/:id (regeneration + cross-user protection, tests 6, 7, 11, 15, 16)", () => {
  it("creates a new version, preserving the previous one, and increments the version number", async () => {
    const { cookieHeader, lead } = await newUserWithLead("patch-version");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();

    const patched = await handlePatchWebsite(
      prisma,
      req(`http://localhost/api/websites/${created.id}`, { method: "PATCH", body: { contentJSON: { ...validContent, theme: "bold" } }, cookieHeader }),
      { id: created.id },
    );
    const body = await patched.json();

    expect(body.versions).toHaveLength(2);
    expect(body.versions[0].versionNumber).toBe(1);
    expect(body.versions[0].theme).toBe("clean"); // unchanged historical version
    expect(body.versions[1].versionNumber).toBe(2);
    expect(body.versions[1].theme).toBe("bold");
    expect(body.theme).toBe("bold"); // project's current-state fields updated
  });

  it("rejects a PATCH attempting to set status/publishedUrl directly", async () => {
    const { cookieHeader, lead } = await newUserWithLead("patch-forbidden-fields");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();

    await expect(
      handlePatchWebsite(prisma, req(`http://localhost/api/websites/${created.id}`, { method: "PATCH", body: { contentJSON: validContent, status: "PUBLISHED" }, cookieHeader }), {
        id: created.id,
      }),
    ).rejects.toThrow(ZodError);
  });

  it("rejects another user's PATCH, leaving version history untouched", async () => {
    const { cookieHeader, lead } = await newUserWithLead("patch-owner-a");
    const { cookieHeader: otherCookie } = await authedUser("patch-owner-b");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();

    await expect(
      handlePatchWebsite(prisma, req(`http://localhost/api/websites/${created.id}`, { method: "PATCH", body: { contentJSON: { ...validContent, theme: "hijacked" } }, cookieHeader: otherCookie }), {
        id: created.id,
      }),
    ).rejects.toThrow(NotFoundError);

    const stillOneVersion = await prisma.websiteVersion.findMany({ where: { websiteProjectId: created.id } });
    expect(stillOneVersion).toHaveLength(1);
  });
});

describe("POST /api/websites/:id/publish (cross-user protection + invalid state, tests 12, 17, 18)", () => {
  it("publishes successfully", async () => {
    const { cookieHeader, lead } = await newUserWithLead("publish");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();

    const response = await handlePublishWebsite(prisma, req(`http://localhost/api/websites/${created.id}/publish`, { method: "POST", cookieHeader }), { id: created.id });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("PUBLISHED");
    expect(body.publishedUrl).toBeTruthy();
  });

  it("rejects publishing an already-published project", async () => {
    const { cookieHeader, lead } = await newUserWithLead("publish-twice");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();
    await handlePublishWebsite(prisma, req(`http://localhost/api/websites/${created.id}/publish`, { method: "POST", cookieHeader }), { id: created.id });

    await expect(handlePublishWebsite(prisma, req(`http://localhost/api/websites/${created.id}/publish`, { method: "POST", cookieHeader }), { id: created.id })).rejects.toThrow(
      InvalidWebsiteTransitionError,
    );
  });

  it("rejects another user's publish attempt", async () => {
    const { cookieHeader, lead } = await newUserWithLead("publish-owner-a");
    const { cookieHeader: otherCookie } = await authedUser("publish-owner-b");
    const created = await (
      await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }))
    ).json();

    await expect(handlePublishWebsite(prisma, req(`http://localhost/api/websites/${created.id}/publish`, { method: "POST", cookieHeader: otherCookie }), { id: created.id })).rejects.toThrow(
      NotFoundError,
    );

    const stillDraft = await prisma.websiteProject.findUnique({ where: { id: created.id } });
    expect(stillDraft?.status).toBe("DRAFT");
  });
});

describe("GET /api/websites (list)", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleListWebsites(prisma, req("http://localhost/api/websites"))).rejects.toThrow(UnauthenticatedError);
  });

  it("only lists the authenticated user's own projects", async () => {
    const { cookieHeader, lead } = await newUserWithLead("list-mine");
    await newUserWithLead("list-other");
    await handleCreateWebsite(prisma, req("http://localhost/api/websites", { method: "POST", body: { leadId: lead.id, contentJSON: validContent }, cookieHeader }));

    const response = await handleListWebsites(prisma, req("http://localhost/api/websites", { cookieHeader }));
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].leadId).toBe(lead.id);
  });
});
