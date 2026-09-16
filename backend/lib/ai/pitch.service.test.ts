import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { createCampaign } from "../campaigns/campaign.service";
import { ingestBusinessAsLead, applyLeadAnalysis } from "../leads/lead.service";
import { createWebsiteProject } from "../websites/website.service";
import { calculateOpportunityScore } from "../scoring/scoring";
import { generatePitch } from "./pitch.service";
import { AiPitchFailedError, ConflictError, NotFoundError } from "../errors";
import { OllamaRequestError, type OllamaClient, type OllamaGenerateResult } from "./ollama-client";
import type { BusinessProviderInput } from "../validation/business";
import type { TemplateContent } from "../validation/website";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "pitch-service-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.business.deleteMany({ where: { source: "demo", externalId: { startsWith: EXTERNAL_ID_PREFIX } } });
  await prisma.$disconnect();
});

let providerSeq = 0;
async function newAnalyzedLead(prefix: string, businessOverrides: Partial<BusinessProviderInput> = {}) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, { name: "Pitch Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });

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
    latitude: 13.0827,
    longitude: 80.2707,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
    ...businessOverrides,
  };

  const { business, lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  const score = calculateOpportunityScore(business);
  await applyLeadAnalysis(prisma, { leadId: lead.id, score, recommendedService: "WEBSITE", estimatedDealMin: 15000, estimatedDealMax: 25000 });

  return { user, campaign, lead, business };
}

function validResponseText(message = "Hi Lakshmi Dental Care, we noticed you don't have a website yet — we can build one for you."): string {
  return JSON.stringify({ message });
}

type Scripted = { text: string } | { error: Error };

class ScriptedOllamaClient implements OllamaClient {
  callCount = 0;
  prompts: string[] = [];
  constructor(private readonly responses: Scripted[]) {}

  async generate(input: { prompt: string }): Promise<OllamaGenerateResult> {
    this.prompts.push(input.prompt);
    const index = Math.min(this.callCount, this.responses.length - 1);
    const scripted = this.responses[index]!;
    this.callCount += 1;
    if ("error" in scripted) throw scripted.error;
    return { text: scripted.text, latencyMs: 12 };
  }
}

const websiteContent = (): TemplateContent => ({
  template: "clinic-modern",
  businessName: "Lakshmi Dental Care",
  theme: "clean",
  hero: { headline: "Trusted Dental Care", subheadline: "Modern dental care in Chennai.", cta: "Book Appointment" },
  services: ["Dental Implants"],
  contact: { phone: "+91-9800000001", address: "Chennai" },
});

describe("generatePitch — successful generation (tests 1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 16)", () => {
  it("persists a valid pitch, records PITCH_GENERATED, and never transitions the lead to PITCHED", async () => {
    const { user, lead } = await newAnalyzedLead("success");
    const ollama = new ScriptedOllamaClient([{ text: validResponseText() }]);

    const result = await generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id });

    expect(result.pitch.content).toContain("Lakshmi Dental Care");
    expect(result.pitch.status).toBe("GENERATED");
    expect(result.pitch.promptVersion).toBe("v1");
    expect(result.pitch.modelName).toBeTruthy();
    expect(result.pitch.createdAt).toBeInstanceOf(Date);
    expect(result.pitch.updatedAt).toBeInstanceOf(Date);
    expect(result.repairUsed).toBe(false);

    const persisted = await prisma.pitch.findUnique({ where: { id: result.pitch.id } });
    expect(persisted).toMatchObject({ status: "GENERATED", promptVersion: "v1" });

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "PITCH_GENERATED")).toBe(true);

    // Section 12: generating a pitch must NOT transition the lead.
    const currentLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(currentLead?.status).toBe("ANALYZED"); // set by applyLeadAnalysis in the fixture, unchanged by generatePitch
  });

  it("works when no website/demo project exists for the lead (test 13)", async () => {
    const { user, lead } = await newAnalyzedLead("no-website");
    const ollama = new ScriptedOllamaClient([{ text: validResponseText() }]);

    const result = await generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id });
    expect(result.pitch.status).toBe("GENERATED");
    expect(ollama.prompts[0]).toContain("DEMO WEBSITE (only mention this if it is not null; never invent a demo URL):\nnull");
  });

  it("includes the current website/demo content when one exists (test 12)", async () => {
    const { user, lead } = await newAnalyzedLead("with-website");
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: websiteContent() });

    const ollama = new ScriptedOllamaClient([{ text: validResponseText() }]);
    await generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id });

    expect(ollama.prompts[0]).toContain("clinic-modern");
    expect(ollama.prompts[0]).toContain(project.demoUrl!);
  });

  it("uses the lead's already-configured recommendedService pricing in the prompt (test 16)", async () => {
    const { user, lead } = await newAnalyzedLead("pricing");
    const ollama = new ScriptedOllamaClient([{ text: validResponseText() }]);

    await generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id });

    // WEBSITE is configured 15000-25000 (prisma/seed.ts, stable seed data).
    expect(ollama.prompts[0]).toContain('"recommendedService": "WEBSITE"');
    expect(ollama.prompts[0]).toContain('"priceMin": 15000');
    expect(ollama.prompts[0]).toContain('"priceMax": 25000');
  });
});

describe("generatePitch — repair retry and rejection (tests 3, 14, 21-style single retry)", () => {
  it("repairs malformed JSON on the second attempt and succeeds", async () => {
    const { user, lead } = await newAnalyzedLead("repair-malformed");
    const ollama = new ScriptedOllamaClient([{ text: "not json at all {" }, { text: validResponseText() }]);

    const result = await generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id });
    expect(result.pitch.status).toBe("GENERATED");
    expect(result.repairUsed).toBe(true);
    expect(ollama.callCount).toBe(2);
  });

  it("repairs a schema-invalid response (extra unexpected field) on the second attempt", async () => {
    const { user, lead } = await newAnalyzedLead("repair-schema-invalid");
    const ollama = new ScriptedOllamaClient([{ text: JSON.stringify({ message: "Hi there", recommendedService: "WEBSITE" }) }, { text: validResponseText() }]);

    const result = await generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id });
    expect(result.pitch.status).toBe("GENERATED");
    expect(ollama.callCount).toBe(2);
  });

  it("rejects a response containing a fabricated phone number, repairs, and succeeds with a clean message (test 14)", async () => {
    const { user, lead } = await newAnalyzedLead("fabricated-phone");
    const ollama = new ScriptedOllamaClient([{ text: validResponseText("Call us right now at +91-9999999999 for a special deal!") }, { text: validResponseText() }]);

    const result = await generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id });
    expect(result.pitch.status).toBe("GENERATED");
    expect(result.pitch.content).not.toContain("9999999999");
  });

  it("fails permanently (and persists nothing) when both attempts contain fabricated facts", async () => {
    const { user, lead } = await newAnalyzedLead("fabricated-phone-fails");
    const badText = validResponseText("Call us right now at +91-9999999999 for a special deal!");
    const ollama = new ScriptedOllamaClient([{ text: badText }, { text: badText }]);

    await expect(generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id })).rejects.toThrow(AiPitchFailedError);
    expect(ollama.callCount).toBe(2); // exactly one repair, never a third attempt

    const pitches = await prisma.pitch.findMany({ where: { leadId: lead.id } });
    expect(pitches).toHaveLength(0); // nothing persisted on failure

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "PITCH_GENERATED")).toBe(false);

    const currentLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(currentLead?.status).toBe("ANALYZED"); // untouched
  });

  it("fails permanently on an Ollama timeout/connection failure on both attempts, without corrupting the lead", async () => {
    const { user, lead } = await newAnalyzedLead("timeout");
    const ollama = new ScriptedOllamaClient([{ error: new OllamaRequestError("timed out") }, { error: new OllamaRequestError("connection refused") }]);

    await expect(generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id })).rejects.toThrow(AiPitchFailedError);

    const pitches = await prisma.pitch.findMany({ where: { leadId: lead.id } });
    expect(pitches).toHaveLength(0);
  });

  it("does not overwrite an existing valid pitch when a later generation attempt fails (test: failed pitch does not mutate lead)", async () => {
    const { user, lead } = await newAnalyzedLead("preserve-existing");
    const goodOllama = new ScriptedOllamaClient([{ text: validResponseText("Original good pitch.") }]);
    const first = await generatePitch(prisma, goodOllama, { leadId: lead.id, userId: user.id });

    const badOllama = new ScriptedOllamaClient([{ text: "garbage" }, { text: "still garbage" }]);
    await expect(generatePitch(prisma, badOllama, { leadId: lead.id, userId: user.id })).rejects.toThrow(AiPitchFailedError);

    const stillThere = await prisma.pitch.findUnique({ where: { id: first.pitch.id } });
    expect(stillThere?.content).toBe("Original good pitch.");
    expect(stillThere?.status).toBe("GENERATED");

    const allPitches = await prisma.pitch.findMany({ where: { leadId: lead.id } });
    expect(allPitches).toHaveLength(1); // the failed attempt did not add a second row
  });
});

describe("generatePitch — authorization and preconditions (tests 11, 15)", () => {
  it("rejects generation for another user's lead, never calling Ollama", async () => {
    const { lead } = await newAnalyzedLead("owner-a");
    const other = await createTestUser("owner-b");
    createdUserIds.push(other.id);
    const ollama = new ScriptedOllamaClient([{ text: validResponseText() }]);

    await expect(generatePitch(prisma, ollama, { leadId: lead.id, userId: other.id })).rejects.toThrow(NotFoundError);
    expect(ollama.callCount).toBe(0);
  });

  it("rejects generation when the lead has no recommendedService yet (not analyzed)", async () => {
    const user = await createTestUser("not-analyzed");
    createdUserIds.push(user.id);
    const campaign = await createCampaign(prisma, user.id, { name: "Pitch Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
    providerSeq += 1;
    const { lead } = await ingestBusinessAsLead(prisma, {
      campaignId: campaign.id,
      providerInput: {
        name: "Unanalyzed Clinic",
        category: "Dental Clinic",
        address: null,
        city: null,
        phone: "+91-9800000009",
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

    const ollama = new ScriptedOllamaClient([{ text: validResponseText() }]);
    await expect(generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id })).rejects.toThrow(ConflictError);
    expect(ollama.callCount).toBe(0);
  });

  it("rejects generation when the lead's recommendedService is no longer an active configured service (test 15)", async () => {
    const { user, lead } = await newAnalyzedLead("deactivated-service");
    // POS is stable seed data but not relied on by any other test's pricing
    // assertions — deactivated and restored within this test only.
    await prisma.lead.update({ where: { id: lead.id }, data: { recommendedService: "POS" } });
    await prisma.service.update({ where: { code: "POS" }, data: { active: false } });

    try {
      const ollama = new ScriptedOllamaClient([{ text: validResponseText() }]);
      await expect(generatePitch(prisma, ollama, { leadId: lead.id, userId: user.id })).rejects.toThrow(ConflictError);
      expect(ollama.callCount).toBe(0);
    } finally {
      await prisma.service.update({ where: { code: "POS" }, data: { active: true } });
    }
  });
});
