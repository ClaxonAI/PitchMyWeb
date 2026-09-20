import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers } from "../../../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { ConflictError, NotFoundError, UnauthenticatedError, ValidationError } from "../../../../../lib/errors";
import { createCampaign } from "../../../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead, persistGeneratedPitch } from "../../../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../../../lib/validation/business";
import { handleGenerateWhatsAppAction } from "./route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "whatsapp-route-test-";
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

function req(url: string, cookieHeader?: string) {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(url, { method: "POST", headers });
}

let providerSeq = 0;
async function newLeadWithPitch(prefix: string, phone: string | null = "+91-9800000001") {
  const { user, cookieHeader } = await authedUser(prefix);
  const campaign = await createCampaign(prisma, user.id, { name: "WhatsApp Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  providerSeq += 1;
  const providerInput: BusinessProviderInput = {
    // Phase 2 dedup engine: a shared name+city across "different" test
    // businesses would attach them all to one canonical business (tier 4,
    // no corroboration needed) — distinct per call, like the phone below.
    name: `Lakshmi Dental Care ${providerSeq}`,
    category: "Dental Clinic",
    address: "12 MG Road",
    city: "Chennai",
    phone,
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.8,
    reviewCount: 240,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
  };
  const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  const pitch = await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Hi Lakshmi Dental Care, we noticed you don't have a website yet.", promptVersion: "v1", modelName: "test-model" });
  return { user, cookieHeader, lead, pitch };
}

describe("POST /api/leads/:id/whatsapp", () => {
  it("rejects an unauthenticated request", async () => {
    const { lead } = await newLeadWithPitch("unauth");
    await expect(handleGenerateWhatsAppAction(prisma, req(`http://localhost/api/leads/${lead.id}/whatsapp`), { id: lead.id })).rejects.toThrow(UnauthenticatedError);
  });

  it("returns NotFoundError for another user's lead", async () => {
    const { lead } = await newLeadWithPitch("owner-a");
    const { cookieHeader: otherCookie } = await authedUser("owner-b");
    await expect(handleGenerateWhatsAppAction(prisma, req(`http://localhost/api/leads/${lead.id}/whatsapp`, otherCookie), { id: lead.id })).rejects.toThrow(NotFoundError);
  });

  it("generates a WhatsApp URL and Outreach record on success (no automatic sending, no status change)", async () => {
    const { cookieHeader, lead, pitch } = await newLeadWithPitch("success");
    const response = await handleGenerateWhatsAppAction(prisma, req(`http://localhost/api/leads/${lead.id}/whatsapp`, cookieHeader), { id: lead.id });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.whatsappUrl).toContain("https://wa.me/919800000001?text=");
    expect(body.outreach.pitchId).toBe(pitch.id);
    expect(body.outreach.status).toBe("LINK_GENERATED");

    const currentLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(currentLead?.status).toBe("NEW");

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "WHATSAPP_OPENED")).toBe(false);
  });

  it("rejects when the business has no valid phone number", async () => {
    const { cookieHeader, lead } = await newLeadWithPitch("no-phone", null);
    await expect(handleGenerateWhatsAppAction(prisma, req(`http://localhost/api/leads/${lead.id}/whatsapp`, cookieHeader), { id: lead.id })).rejects.toThrow(ValidationError);
  });

  it("rejects when no pitch has been generated for the lead", async () => {
    const { user, cookieHeader } = await authedUser("no-pitch");
    const campaign = await createCampaign(prisma, user.id, { name: "No Pitch", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
    providerSeq += 1;
    const { lead } = await ingestBusinessAsLead(prisma, {
      campaignId: campaign.id,
      providerInput: {
        name: "No Pitch Clinic",
        category: "Dental Clinic",
        address: null,
        city: null,
        phone: "+91-9800000002",
        email: null,
        website: null,
        instagram: null,
        facebook: null,
        rating: null,
        reviewCount: null,
        latitude: null,
        longitude: null,
        source: "demo",
        externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
      },
    });

    await expect(handleGenerateWhatsAppAction(prisma, req(`http://localhost/api/leads/${lead.id}/whatsapp`, cookieHeader), { id: lead.id })).rejects.toThrow(ConflictError);
  });
});
