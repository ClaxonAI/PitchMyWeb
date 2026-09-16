import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { AiAnalysisFailedError, NotFoundError, RateLimitedError, UnauthenticatedError } from "../../../../../lib/errors";
import { createCampaign } from "../../../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead } from "../../../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../../../lib/validation/business";
import type { OllamaClient, OllamaGenerateResult } from "../../../../../lib/ai/ollama-client";
import { handleAnalyzeLead } from "./route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "analyze-route-test-";
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

function req(url: string, cookieHeader?: string) {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(url, { method: "POST", headers });
}

let providerSeq = 0;
async function newAnalyzableLead(prefix: string) {
  const { user, cookieHeader } = await authedUser(prefix);
  const campaign = await createCampaign(prisma, user.id, { name: "Analyze Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
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
    rating: 4.8,
    reviewCount: 240,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
  };
  const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  return { user, cookieHeader, lead };
}

function fakeOllama(text: string): OllamaClient {
  return {
    async generate(): Promise<OllamaGenerateResult> {
      return {
        text,
        latencyMs: 5,
      };
    },
  };
}

const validResponseText = JSON.stringify({
  summary: "Established dental clinic with strong reviews and no website on file.",
  websiteNeed: 90,
  whatsappNeed: 60,
  reviewAutomationNeed: 40,
  voiceAgentNeed: 20,
  recommendedService: "WEBSITE",
  estimatedDealMin: 15000,
  estimatedDealMax: 25000,
});

describe("POST /api/leads/:id/analyze", () => {
  it("rejects an unauthenticated request before touching Ollama", async () => {
    const { lead } = await newAnalyzableLead("unauth");
    let called = false;
    const ollama: OllamaClient = {
      async generate() {
        called = true;
        return { text: validResponseText, latencyMs: 1 };
      },
    };
    await expect(handleAnalyzeLead(prisma, req(`http://localhost/api/leads/${lead.id}/analyze`), { id: lead.id }, ollama)).rejects.toThrow(UnauthenticatedError);
    expect(called).toBe(false);
  });

  it("returns NotFoundError for another user's lead (no data leakage), never calling Ollama", async () => {
    const { lead } = await newAnalyzableLead("owner-a");
    const { cookieHeader: otherCookie } = await authedUser("owner-b");
    let called = false;
    const ollama: OllamaClient = {
      async generate() {
        called = true;
        return { text: validResponseText, latencyMs: 1 };
      },
    };
    await expect(handleAnalyzeLead(prisma, req(`http://localhost/api/leads/${lead.id}/analyze`, otherCookie), { id: lead.id }, ollama)).rejects.toThrow(NotFoundError);
    expect(called).toBe(false);
  });

  it("returns the full lead detail (with the new analysis) on success", async () => {
    const { cookieHeader, lead } = await newAnalyzableLead("success");
    const response = await handleAnalyzeLead(prisma, req(`http://localhost/api/leads/${lead.id}/analyze`, cookieHeader), { id: lead.id }, fakeOllama(validResponseText));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ANALYZED");
    expect(body.recommendedService).toBe("WEBSITE");
    expect(body.analyses).toHaveLength(1);
    expect(body.analyses[0].status).toBe("SUCCESS");
    expect(body.activities.some((a: { type: string }) => a.type === "LEAD_ANALYZED")).toBe(true);
  });

  it("maps a permanently failed analysis to a controlled error, not a raw crash", async () => {
    const { cookieHeader, lead } = await newAnalyzableLead("failure");
    await expect(handleAnalyzeLead(prisma, req(`http://localhost/api/leads/${lead.id}/analyze`, cookieHeader), { id: lead.id }, fakeOllama("not json at all"))).rejects.toThrow(
      AiAnalysisFailedError,
    );

    const stillNew = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(stillNew?.status).toBe("NEW");
  });
});

// backend_tasks.md section 41: "rate limiting for... AI-triggering
// endpoints where practical." Keyed per user (lib/api/rate-limit.ts's
// windows Map is module-scoped and persists for the whole test run, so a
// fresh user per test — via authedUser — gives each test its own bucket
// without needing to reuse a fixed key like the login IP tests do.
describe("POST /api/leads/:id/analyze - rate limiting (section 41)", () => {
  it("rejects the 21st analyze call within the window for the same user", async () => {
    const { user, cookieHeader } = await authedUser("rate-limit");
    const campaign = await createCampaign(prisma, user.id, { name: "Rate Limit Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 30 });

    for (let i = 0; i < 20; i += 1) {
      providerSeq += 1;
      const { lead } = await ingestBusinessAsLead(prisma, {
        campaignId: campaign.id,
        providerInput: {
          name: `Rate Limit Clinic ${i}`,
          category: "Dental Clinic",
          address: "12 MG Road",
          city: "Chennai",
          phone: "+91-9800000001",
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
        },
      });
      const response = await handleAnalyzeLead(prisma, req(`http://localhost/api/leads/${lead.id}/analyze`, cookieHeader), { id: lead.id }, fakeOllama(validResponseText));
      expect(response.status).toBe(200);
    }

    // A 21st lead for the same user: the rate limit check runs before any
    // Ollama/business logic, so this fails purely on the count, regardless
    // of the lead's own eligibility.
    providerSeq += 1;
    const { lead: overLimitLead } = await ingestBusinessAsLead(prisma, {
      campaignId: campaign.id,
      providerInput: {
        name: "Rate Limit Clinic Over",
        category: "Dental Clinic",
        address: "12 MG Road",
        city: "Chennai",
        phone: "+91-9800000001",
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
      },
    });
    await expect(
      handleAnalyzeLead(prisma, req(`http://localhost/api/leads/${overLimitLead.id}/analyze`, cookieHeader), { id: overLimitLead.id }, fakeOllama(validResponseText)),
    ).rejects.toThrow(RateLimitedError);
  }, 30000);
});
