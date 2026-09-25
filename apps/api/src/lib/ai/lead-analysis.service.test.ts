import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueBusinessName, uniqueIndianPhone } from "../testing/db-test-helpers";
import { createCampaign } from "../campaigns/campaign.service";
import { ingestBusinessAsLead, getLeadForUser } from "../leads/lead.service";
import { calculateOpportunityScore } from "../scoring/scoring";
import { analyzeLead } from "./lead-analysis.service";
import { AiAnalysisFailedError, InvalidLeadTransitionError, NotFoundError } from "../errors";
import { AiRequestError, type AiClient, type AiGenerateResult } from "./ai-client";
import type { AiLeadAnalysisResponse } from "../validation/ai";
import type { BusinessProviderInput } from "../validation/business";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "ai-analysis-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

let providerSeq = 0;
async function newAnalyzableLead(prefix: string, businessOverrides: Partial<BusinessProviderInput> = {}) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, { name: "AI Analysis Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });

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
    email: "contact@lakshmidental.example.com",
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
  return { user, campaign, business, lead };
}

function validResponseText(overrides: Partial<AiLeadAnalysisResponse> = {}): string {
  return JSON.stringify({
    summary: "Established dental clinic with strong reviews and no website on file.",
    websiteNeed: 90,
    whatsappNeed: 60,
    reviewAutomationNeed: 40,
    voiceAgentNeed: 20,
    recommendedService: "WEBSITE",
    estimatedDealMin: 15000,
    estimatedDealMax: 25000,
    ...overrides,
  });
}

type Scripted = { text: string } | { error: Error };

class ScriptedAiClient implements AiClient {
  callCount = 0;
  prompts: string[] = [];
  constructor(
    private readonly responses: Scripted[],
    readonly model?: string,
  ) {}

  async generate(input: { prompt: string }): Promise<AiGenerateResult> {
    this.prompts.push(input.prompt);
    const index = Math.min(this.callCount, this.responses.length - 1);
    const scripted = this.responses[index]!;
    this.callCount += 1;
    if ("error" in scripted) throw scripted.error;
    return { text: scripted.text, latencyMs: 12 };
  }
}

describe("analyzeLead — successful analysis", () => {
  it("persists a valid AI response, transitions the lead, and records LEAD_ANALYZED (tests 1, 17, 18)", async () => {
    const { user, lead, business } = await newAnalyzableLead("success");
    const ai = new ScriptedAiClient([{ text: validResponseText() }]);

    const result = await analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id });

    expect(result.lead.status).toBe("ANALYZED");
    expect(result.lead.recommendedService).toBe("WEBSITE");
    expect(result.lead.estimatedDealMin).toBe(15000);
    expect(result.lead.estimatedDealMax).toBe(25000);
    expect(result.repairUsed).toBe(false);

    const detail = await getLeadForUser(prisma, user.id, lead.id);
    expect(detail.activities.some((a) => a.type === "LEAD_ANALYZED")).toBe(true);

    // deterministic score remains authoritative (test 10): matches an
    // independent computation from the same scoring service, not
    // something the AI could have influenced.
    const expectedScore = calculateOpportunityScore(business);
    expect(detail.score).toBe(expectedScore.total);
    expect(detail.scores[0]?.total).toBe(expectedScore.total);
    expect(detail.scores[0]?.classification).toBe(expectedScore.classification);
  });

  it("persists model name, prompt version, latency, and SUCCESS status (tests 13, 14, 15, 16)", async () => {
    const { user, lead } = await newAnalyzableLead("metadata");
    const ai = new ScriptedAiClient([{ text: validResponseText() }], "gpt-test");

    await analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id });

    const analysis = await prisma.leadAnalysis.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" } });
    expect(analysis?.status).toBe("SUCCESS");
    expect(analysis?.modelName).toBe("gpt-test");
    expect(analysis?.promptVersion).toBe("v1");
    expect(analysis?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(analysis?.repairUsed).toBe(false);
    expect(analysis?.summary).toContain("Established dental clinic");
  });
});

describe("analyzeLead — repair retry behavior", () => {
  it("repairs malformed JSON on the second attempt and succeeds (tests 2, 4, 21)", async () => {
    const { user, lead } = await newAnalyzableLead("repair-malformed-json");
    const ai = new ScriptedAiClient([{ text: "this is not json at all {" }, { text: validResponseText() }]);

    const result = await analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id });

    expect(result.lead.status).toBe("ANALYZED");
    expect(result.repairUsed).toBe(true);
    expect(ai.callCount).toBe(2); // exactly one repair attempt, not more
  });

  it("repairs a schema-invalid response (arbitrary recommendedService) on the second attempt (tests 3, 4, 11, 21)", async () => {
    const { user, lead } = await newAnalyzableLead("repair-schema-invalid");
    const ai = new ScriptedAiClient([{ text: validResponseText({ recommendedService: "FAKE_SERVICE" as never }) }, { text: validResponseText() }]);

    const result = await analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id });

    expect(result.lead.status).toBe("ANALYZED");
    expect(result.lead.recommendedService).toBe("WEBSITE"); // never the arbitrary value
    expect(ai.callCount).toBe(2);
  });

  it("repairs an invalid deal range (max < min) on the second attempt (test 12)", async () => {
    const { user, lead } = await newAnalyzableLead("repair-deal-range");
    const ai = new ScriptedAiClient([{ text: validResponseText({ estimatedDealMin: 30000, estimatedDealMax: 5000 }) }, { text: validResponseText() }]);

    const result = await analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id });
    expect(result.lead.status).toBe("ANALYZED");
    expect(ai.callCount).toBe(2);
  });

  it("fails permanently when both the original and repaired responses are invalid, without exceeding one repair (test 5, 21)", async () => {
    const { user, lead } = await newAnalyzableLead("repair-failure");
    const ai = new ScriptedAiClient([{ text: "not json" }, { text: "still not json" }]);

    await expect(analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id })).rejects.toThrow(AiAnalysisFailedError);
    expect(ai.callCount).toBe(2); // exactly two attempts total, never a third
  });
});

describe("analyzeLead — failure isolation (tests 6, 8, 19, 20, 23)", () => {
  it("treats a model timeout/connection failure as a failed attempt eligible for the one repair, and fails cleanly if repair also fails", async () => {
    const { user, lead } = await newAnalyzableLead("timeout-then-fail");
    const ai = new ScriptedAiClient([{ error: new AiRequestError("Request timed out after 30000ms") }, { error: new AiRequestError("connection refused") }]);

    const before = await prisma.lead.findUnique({ where: { id: lead.id } });

    await expect(analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id })).rejects.toThrow(AiAnalysisFailedError);

    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after).toEqual(before); // completely unchanged — status, score, recommendedService, updatedAt
    expect(after?.status).toBe("NEW");
    expect(after?.score).toBeNull();
    expect(after?.recommendedService).toBeNull();

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "LEAD_ANALYZED")).toBe(false);

    const analysis = await prisma.leadAnalysis.findFirst({ where: { leadId: lead.id } });
    expect(analysis?.status).toBe("FAILED");
    expect(analysis?.repairUsed).toBe(true);
  });

  it("a timeout on the very first attempt still gets exactly one repair chance before failing", async () => {
    const { user, lead } = await newAnalyzableLead("timeout-first-only");
    const ai = new ScriptedAiClient([{ error: new AiRequestError("timed out") }, { text: validResponseText() }]);

    const result = await analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id });
    expect(result.lead.status).toBe("ANALYZED");
    expect(ai.callCount).toBe(2);
  });

  it("never exposes the raw model error message to the thrown error (section 19)", async () => {
    const { user, lead } = await newAnalyzableLead("sanitized-error");
    const ai = new ScriptedAiClient([{ error: new AiRequestError("connect ECONNREFUSED 10.0.0.5:11434 apikey=sk-secret") }, { error: new AiRequestError("connect ECONNREFUSED 10.0.0.5:11434 apikey=sk-secret") }]);

    const error = await analyzeLead(prisma, ai, { leadId: lead.id, userId: user.id }).catch((e) => e);
    expect(error).toBeInstanceOf(AiAnalysisFailedError);
    expect((error as Error).message).not.toContain("sk-secret");
    expect((error as Error).message).not.toContain("10.0.0.5");
  });
});

describe("analyzeLead — authorization and lifecycle (tests 9, 22, 24)", () => {
  it("throws NotFoundError (no data leakage) when analyzing another user's lead", async () => {
    const { lead } = await newAnalyzableLead("owner-a");
    const other = await createTestUser("owner-b");
    createdUserIds.push(other.id);
    const ai = new ScriptedAiClient([{ text: validResponseText() }]);

    await expect(analyzeLead(prisma, ai, { leadId: lead.id, userId: other.id })).rejects.toThrow(NotFoundError);
    expect(ai.callCount).toBe(0); // ownership is checked before ever calling the model
  });

  it("rejects re-analyzing an already-ANALYZED lead before calling the model, and does not touch the existing valid analysis (test 22)", async () => {
    const { user, lead } = await newAnalyzableLead("no-reanalyze");
    const firstAi = new ScriptedAiClient([{ text: validResponseText() }]);
    const first = await analyzeLead(prisma, firstAi, { leadId: lead.id, userId: user.id });
    expect(first.lead.status).toBe("ANALYZED");

    const existingAnalysis = await prisma.leadAnalysis.findFirst({ where: { leadId: lead.id } });
    const existingLead = await prisma.lead.findUnique({ where: { id: lead.id } });

    // A second attempt, scripted to fail even the repair, must never even
    // be reached — the existing lifecycle graph (NEW -> ANALYZED only)
    // rejects this before any model call.
    const secondAi = new ScriptedAiClient([{ text: "garbage" }, { text: "still garbage" }]);
    await expect(analyzeLead(prisma, secondAi, { leadId: lead.id, userId: user.id })).rejects.toThrow(InvalidLeadTransitionError);
    expect(secondAi.callCount).toBe(0);

    const afterLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    const afterAnalysisCount = await prisma.leadAnalysis.count({ where: { leadId: lead.id } });
    expect(afterLead).toEqual(existingLead);
    expect(afterAnalysisCount).toBe(1); // the original SUCCESS row, untouched — no new row from the rejected attempt
    expect((await prisma.leadAnalysis.findFirst({ where: { leadId: lead.id } }))?.id).toBe(existingAnalysis?.id);
  });

  it("permits retrying after a full AI failure, since the lead remains NEW (test 24)", async () => {
    const { user, lead } = await newAnalyzableLead("retry-after-failure");
    const failingAi = new ScriptedAiClient([{ text: "bad" }, { text: "still bad" }]);
    await expect(analyzeLead(prisma, failingAi, { leadId: lead.id, userId: user.id })).rejects.toThrow(AiAnalysisFailedError);

    const stillNew = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(stillNew?.status).toBe("NEW");

    const succeedingAi = new ScriptedAiClient([{ text: validResponseText() }]);
    const retried = await analyzeLead(prisma, succeedingAi, { leadId: lead.id, userId: user.id });
    expect(retried.lead.status).toBe("ANALYZED");

    // Both the earlier FAILED attempt and the later SUCCESS attempt are
    // preserved as separate history rows.
    const analyses = await prisma.leadAnalysis.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    expect(analyses.map((a) => a.status)).toEqual(["FAILED", "SUCCESS"]);
  });
});
