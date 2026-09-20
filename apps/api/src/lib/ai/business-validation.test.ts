import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { validateAiLeadAnalysisBusinessRules } from "./business-validation";
import type { AiLeadAnalysisResponse } from "../validation/ai";

afterAll(async () => {
  await prisma.$disconnect();
});

// WEBSITE is a stable, always-seeded, always-active Service (15000-25000)
// — see prisma/seed.ts. Not test-created; safe to rely on across runs.
const validResponse: AiLeadAnalysisResponse = {
  summary: "Established clinic with strong reviews and no website on file.",
  websiteNeed: 90,
  whatsappNeed: 60,
  reviewAutomationNeed: 40,
  voiceAgentNeed: 20,
  recommendedService: "WEBSITE",
  estimatedDealMin: 15000,
  estimatedDealMax: 25000,
};

describe("validateAiLeadAnalysisBusinessRules", () => {
  it("accepts a response whose recommendedService is active/configured and whose deal range overlaps its pricing", async () => {
    const result = await validateAiLeadAnalysisBusinessRules(prisma, validResponse, { phone: "+91-9800000001" });
    expect(result.valid).toBe(true);
  });

  it("rejects a deal estimate range with no overlap at all against the configured pricing for the recommended service", async () => {
    // WEBSITE is configured 15000-25000; 1-100 does not overlap it.
    const result = await validateAiLeadAnalysisBusinessRules(prisma, { ...validResponse, estimatedDealMin: 1, estimatedDealMax: 100 }, { phone: "+91-9800000001" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("does not overlap");
  });

  it("accepts a deal estimate range that only partially overlaps the configured pricing", async () => {
    // 20000-40000 partially overlaps WEBSITE's 15000-25000 range.
    const result = await validateAiLeadAnalysisBusinessRules(prisma, { ...validResponse, estimatedDealMin: 20000, estimatedDealMax: 40000 }, { phone: "+91-9800000001" });
    expect(result.valid).toBe(true);
  });

  it("rejects a summary that contains a phone number not present in the business record", async () => {
    const withFabricatedPhone: AiLeadAnalysisResponse = {
      ...validResponse,
      summary: "Contact them directly at +91-9999999999 for a fast response.",
    };
    const result = await validateAiLeadAnalysisBusinessRules(prisma, withFabricatedPhone, { phone: "+91-9800000001" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("phone number");
  });

  it("rejects a summary containing a phone number when the business has none on file at all", async () => {
    const withFabricatedPhone: AiLeadAnalysisResponse = {
      ...validResponse,
      summary: "Reach them at +91-9999999999.",
    };
    const result = await validateAiLeadAnalysisBusinessRules(prisma, withFabricatedPhone, { phone: null });
    expect(result.valid).toBe(false);
  });

  it("accepts a summary that quotes the business's own real phone number", async () => {
    const withRealPhone: AiLeadAnalysisResponse = {
      ...validResponse,
      summary: "Reachable at +91-9800000001 for consultations.",
    };
    const result = await validateAiLeadAnalysisBusinessRules(prisma, withRealPhone, { phone: "+91-9800000001" });
    expect(result.valid).toBe(true);
  });

  it("does not false-positive on ordinary short numbers (ratings, counts) in the summary", async () => {
    const withOrdinaryNumbers: AiLeadAnalysisResponse = {
      ...validResponse,
      summary: "Rated 4.8 out of 5 across 240 reviews, established for over 10 years.",
    };
    const result = await validateAiLeadAnalysisBusinessRules(prisma, withOrdinaryNumbers, { phone: "+91-9800000001" });
    expect(result.valid).toBe(true);
  });
});
