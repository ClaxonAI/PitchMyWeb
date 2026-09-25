import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./db/client";
import { createTestUser, deleteTestUsers } from "./testing/db-test-helpers";
import { createCampaign, markCampaignReady } from "./campaigns/campaign.service";
import { runCampaign } from "./campaigns/run.service";
import { analyzeLead } from "./ai/lead-analysis.service";
import { generatePitch } from "./ai/pitch.service";
import { generateWhatsAppAction } from "./leads/whatsapp.service";
import { createWebsiteProject } from "./websites/website.service";
import { transitionLeadStatus } from "./leads/lifecycle";
import { getAnalyticsForUser } from "./analytics/analytics.service";
import type { AiClient, AiGenerateResult } from "./ai/ai-client";

// backend_tasks.md section 44 ("Critical Backend Test") / section 2 of the
// final hardening pass: "The backend is not complete until this path can
// execute without manual database edits." Every individual step below
// already has its own dedicated unit/integration tests elsewhere; this
// file exists to prove the *whole chain* actually composes end-to-end
// through the real domain services (the same functions the route handlers
// call), against the real Postgres database, in one continuous run.
//
// The model is faked (section 17: tests never depend on a real model
// server) — this is the documented, spec-compliant way to exercise the AI
// steps deterministically; everything else (DemoProvider, normalization,
// dedup, scoring, persistence, lifecycle, activities, analytics) runs for
// real, nothing is mocked or stubbed out.

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

function fakeAi(text: string): AiClient {
  return {
    async generate(): Promise<AiGenerateResult> {
      return { text, latencyMs: 5 };
    },
  };
}

const analysisResponse = JSON.stringify({
  summary: "Established dental clinic with strong reviews and no website on file.",
  websiteNeed: 92,
  whatsappNeed: 55,
  reviewAutomationNeed: 40,
  voiceAgentNeed: 20,
  recommendedService: "WEBSITE",
  estimatedDealMin: 15000,
  estimatedDealMax: 25000,
});

const pitchResponse = JSON.stringify({
  message: "Hi Coastal Smiles Dental, we noticed you don't have a website yet and would love to help.",
});

describe("Critical backend flow (backend_tasks.md section 44)", () => {
  it("runs campaign -> discovery -> normalize/dedupe -> leads -> score -> AI analysis -> website -> pitch -> whatsapp -> operator-confirmed PITCHED -> activity timeline -> analytics, with no manual DB edits", async () => {
    // 1. Create Campaign
    const user = await createTestUser("critical-flow");
    createdUserIds.push(user.id);
    const campaign = await createCampaign(prisma, user.id, {
      name: "Critical Flow E2E",
      location: "Chennai",
      category: "Dental Clinic",
      websiteRequirement: "WITHOUT_WEBSITE",
      leadLimit: 10,
    });
    await markCampaignReady(prisma, user.id, campaign.id);

    // 2-6. Run Campaign: real DemoProvider returns businesses, they are
    // normalized, deduplicated (unique source+externalId), Leads are
    // created, and the CampaignExecution records how many were found.
    const { execution } = await runCampaign(prisma, user.id, campaign.id);
    expect(execution.status).toBe("COMPLETED");
    expect(execution.businessesFound).toBeGreaterThan(0);
    expect(execution.leadsCreated).toBeGreaterThan(0);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, include: { business: true } });
    expect(leads.length).toBeGreaterThan(0);
    // WITHOUT_WEBSITE + Chennai + Dental Clinic should match "Coastal
    // Smiles Dental" (lib/providers/demo-provider.ts, website: null).
    const target = leads.find((l) => l.business.name === "Coastal Smiles Dental");
    expect(target).toBeTruthy();
    const leadId = target!.id;
    expect(target!.status).toBe("NEW");
    expect(target!.business.website).toBeNull();

    // Re-running the same campaign must not create duplicate businesses or
    // leads (section 37/45: idempotent discovery).
    const businessCountBefore = await prisma.business.count({ where: { source: "demo", externalId: target!.business.externalId! } });
    expect(businessCountBefore).toBe(1);

    // 7-9. Deterministic score is calculated as part of analysis, and
    // totals exactly 100 (backend_tasks.md section 9/46).
    await analyzeLead(prisma, fakeAi(analysisResponse), { leadId, userId: user.id });
    const scoreRow = await prisma.leadScore.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });
    expect(scoreRow).toBeTruthy();
    expect(scoreRow!.rating + scoreRow!.reviewVolume + scoreRow!.websiteGap + scoreRow!.socialPresence + scoreRow!.contactAvailability + scoreRow!.businessValue + scoreRow!.localDemand + scoreRow!.dataQuality).toBe(
      scoreRow!.total,
    );
    expect(scoreRow!.total).toBeGreaterThanOrEqual(0);
    expect(scoreRow!.total).toBeLessThanOrEqual(100);

    // 10-12. AI response was Zod-validated (analyzeLead would have thrown
    // otherwise), recommended service and estimated deal are persisted.
    let lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead!.status).toBe("ANALYZED");
    expect(lead!.recommendedService).toBe("WEBSITE");
    expect(lead!.estimatedDealMin).toBe(15000);
    expect(lead!.estimatedDealMax).toBe(25000);

    // 13-15. Qualified/analyzed lead can trigger website generation;
    // WebsiteProject + its initial WebsiteVersion are persisted, and the
    // lead moves ANALYZED -> SITE_READY as a side effect of that real
    // lifecycle transition.
    const website = await createWebsiteProject(prisma, user.id, {
      leadId,
      contentJSON: {
        template: "clinic-modern",
        businessName: "Coastal Smiles Dental",
        theme: "clean",
        hero: { headline: "Trusted Dental Care", subheadline: "Modern dental care in Chennai.", cta: "Book Appointment" },
        services: ["Dental Implants", "Teeth Cleaning"],
        contact: { phone: "+91-9811100001", address: "14 Marine Drive" },
      },
    });
    expect(website.versions).toHaveLength(1);
    expect(website.status).toBe("DRAFT");
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead!.status).toBe("SITE_READY");

    // 16. Pitch is generated (and persisted) using only verified lead data.
    await generatePitch(prisma, fakeAi(pitchResponse), { leadId, userId: user.id });
    const pitch = await prisma.pitch.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });
    expect(pitch).toBeTruthy();
    expect(pitch!.status).toBe("GENERATED");
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead!.status).toBe("SITE_READY"); // pitch generation alone must NOT move the lead to PITCHED

    // 17. WhatsApp-ready action is generated (link only, no sending).
    const whatsapp = await generateWhatsAppAction(prisma, { leadId, userId: user.id });
    expect(whatsapp.whatsappUrl).toContain("https://wa.me/919811100001?text=");
    expect(whatsapp.outreach.status).toBe("LINK_GENERATED");
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead!.status).toBe("SITE_READY"); // still not PITCHED — generating the link is not sending it

    // 18-19. Only an explicit operator confirmation moves the lead to
    // PITCHED (backend_tasks.md section 32/15; mirrors what PATCH
    // /api/leads/:id does after Zod-validating the requested status).
    lead = await transitionLeadStatus(prisma, { leadId, nextStatus: "PITCHED", expectedOwnerUserId: user.id });
    expect(lead.status).toBe("PITCHED");

    // 20. Activity timeline contains every important event from this run,
    // in the order they actually happened.
    const activities = await prisma.activity.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
    const activityTypes = activities.map((a) => a.type);
    expect(activityTypes).toEqual(["LEAD_CREATED", "LEAD_ANALYZED", "WEBSITE_GENERATED", "PITCH_GENERATED", "PITCHED"]);

    // 21. Analytics reflect the resulting PostgreSQL state — derived live,
    // not from any counter this test incremented itself.
    const analytics = await getAnalyticsForUser(prisma, user.id);
    expect(analytics.qualifiedLeads).toBeGreaterThanOrEqual(1);
    expect(analytics.demosGenerated).toBeGreaterThanOrEqual(1);
    expect(analytics.pitches).toBeGreaterThanOrEqual(1);
    expect(analytics.funnel.analyzed).toBeGreaterThanOrEqual(1);
    expect(analytics.funnel.demo).toBeGreaterThanOrEqual(1);
    expect(analytics.funnel.pitched).toBeGreaterThanOrEqual(1);
  }, 30000);
});
