import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueBusinessName, uniqueIndianPhone } from "../../../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../lib/auth/session";
import { AiPitchFailedError, NotFoundError, RateLimitedError, UnauthenticatedError } from "../../../../../lib/errors";
import { createCampaign } from "../../../../../lib/campaigns/campaign.service";
import { ingestBusinessAsLead, applyLeadAnalysis } from "../../../../../lib/leads/lead.service";
import { calculateOpportunityScore } from "../../../../../lib/scoring/scoring";
import type { BusinessProviderInput } from "../../../../../lib/validation/business";
import type { OllamaClient, OllamaGenerateResult } from "../../../../../lib/ai/ollama-client";
import { handleGeneratePitch } from "./route";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "pitch-route-test-";
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
async function newAnalyzedLead(prefix: string) {
  const { user, cookieHeader } = await authedUser(prefix);
  const campaign = await createCampaign(prisma, user.id, { name: "Pitch Route Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
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
    rating: 4.8,
    reviewCount: 240,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
  };
  const { business, lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  const score = calculateOpportunityScore(business);
  await applyLeadAnalysis(prisma, { leadId: lead.id, score, recommendedService: "WEBSITE", estimatedDealMin: 15000, estimatedDealMax: 25000 });
  return { user, cookieHeader, lead };
}

function fakeOllama(text: string): OllamaClient {
  return {
    async generate(): Promise<OllamaGenerateResult> {
      return { text, latencyMs: 5 };
    },
  };
}

const validResponseText = JSON.stringify({ message: "Hi Lakshmi Dental Care, we noticed you don't have a website yet." });

describe("POST /api/leads/:id/pitch", () => {
  it("rejects an unauthenticated request before touching Ollama", async () => {
    const { lead } = await newAnalyzedLead("unauth");
    let called = false;
    const ollama: OllamaClient = {
      async generate() {
        called = true;
        return { text: validResponseText, latencyMs: 1 };
      },
    };
    await expect(handleGeneratePitch(prisma, req(`http://localhost/api/leads/${lead.id}/pitch`), { id: lead.id }, ollama)).rejects.toThrow(UnauthenticatedError);
    expect(called).toBe(false);
  });

  it("returns NotFoundError for another user's lead, never calling Ollama", async () => {
    const { lead } = await newAnalyzedLead("owner-a");
    const { cookieHeader: otherCookie } = await authedUser("owner-b");
    let called = false;
    const ollama: OllamaClient = {
      async generate() {
        called = true;
        return { text: validResponseText, latencyMs: 1 };
      },
    };
    await expect(handleGeneratePitch(prisma, req(`http://localhost/api/leads/${lead.id}/pitch`, otherCookie), { id: lead.id }, ollama)).rejects.toThrow(NotFoundError);
    expect(called).toBe(false);
  });

  it("returns the full lead detail (with the new pitch and activity) on success, without transitioning status", async () => {
    const { cookieHeader, lead } = await newAnalyzedLead("success");
    const response = await handleGeneratePitch(prisma, req(`http://localhost/api/leads/${lead.id}/pitch`, cookieHeader), { id: lead.id }, fakeOllama(validResponseText));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ANALYZED"); // unchanged — pitch generation != PITCHED
    expect(body.pitches).toHaveLength(1);
    expect(body.pitches[0].status).toBe("GENERATED");
    expect(body.activities.some((a: { type: string }) => a.type === "PITCH_GENERATED")).toBe(true);
  });

  it("maps a permanently failed generation to a controlled error", async () => {
    const { cookieHeader, lead } = await newAnalyzedLead("failure");
    await expect(handleGeneratePitch(prisma, req(`http://localhost/api/leads/${lead.id}/pitch`, cookieHeader), { id: lead.id }, fakeOllama("not json at all"))).rejects.toThrow(
      AiPitchFailedError,
    );

    const pitches = await prisma.pitch.findMany({ where: { leadId: lead.id } });
    expect(pitches).toHaveLength(0);
  });
});

// backend_tasks.md section 41: "rate limiting for... AI-triggering
// endpoints where practical." Pitch generation has no "already pitched"
// restriction (regeneration is allowed), so this reuses one analyzed lead
// for all 20 calls rather than needing 20 distinct leads.
describe("POST /api/leads/:id/pitch - rate limiting (section 41)", () => {
  it("rejects the 21st pitch-generation call within the window for the same user", async () => {
    const { cookieHeader, lead } = await newAnalyzedLead("rate-limit");

    for (let i = 0; i < 20; i += 1) {
      const response = await handleGeneratePitch(prisma, req(`http://localhost/api/leads/${lead.id}/pitch`, cookieHeader), { id: lead.id }, fakeOllama(validResponseText));
      expect(response.status).toBe(200);
    }

    await expect(handleGeneratePitch(prisma, req(`http://localhost/api/leads/${lead.id}/pitch`, cookieHeader), { id: lead.id }, fakeOllama(validResponseText))).rejects.toThrow(
      RateLimitedError,
    );
  }, 30000);
});
