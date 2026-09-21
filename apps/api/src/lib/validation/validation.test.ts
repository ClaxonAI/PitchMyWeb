import { describe, expect, it } from "vitest";
import { campaignCreateSchema, campaignListQuerySchema, campaignUpdateSchema, leadLimitForTarget } from "./campaign";
import { leadListQuerySchema } from "./lead";
import { businessProviderInputSchema } from "./business";
import { settingsUpsertSchema } from "./settings";
import { aiLeadAnalysisResponseSchema } from "./ai";

const validCampaign = {
  name: "Chennai Dentists",
  location: "Chennai",
  category: "Dental Clinic",
  leadLimit: 25,
};

describe("leadLimitForTarget", () => {
  // Asking for 5 leads used to scrape 10 — a deliberate cushion, but one no
  // screen ever mentioned, so the campaign page reported more leads found
  // than were asked for and looked wrong.
  it("searches for exactly as many businesses as the user asked to pitch", () => {
    expect(leadLimitForTarget(5)).toBe(5);
    expect(leadLimitForTarget(1)).toBe(1);
    expect(leadLimitForTarget(200)).toBe(200);
  });
});

describe("campaignCreateSchema", () => {
  it("accepts a minimal valid campaign", () => {
    expect(campaignCreateSchema.safeParse(validCampaign).success).toBe(true);
  });

  it("rejects a missing name", () => {
    const result = campaignCreateSchema.safeParse({ ...validCampaign, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive radius", () => {
    const result = campaignCreateSchema.safeParse({ ...validCampaign, radius: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a minRating outside the valid 0-5 range", () => {
    expect(campaignCreateSchema.safeParse({ ...validCampaign, minRating: 6 }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...validCampaign, minRating: -1 }).success).toBe(false);
  });

  it("rejects a negative minReviews", () => {
    expect(campaignCreateSchema.safeParse({ ...validCampaign, minReviews: -5 }).success).toBe(false);
  });

  it("rejects a non-positive leadLimit", () => {
    expect(campaignCreateSchema.safeParse({ ...validCampaign, leadLimit: 0 }).success).toBe(false);
  });

  it("rejects an invalid websiteRequirement enum value", () => {
    const result = campaignCreateSchema.safeParse({ ...validCampaign, websiteRequirement: "MAYBE" });
    expect(result.success).toBe(false);
  });

  it("defaults websiteRequirement to ANY when omitted on create (default is legitimate here)", () => {
    const result = campaignCreateSchema.parse(validCampaign);
    expect(result.websiteRequirement).toBe("ANY");
  });
});

// Phase 4 code-review finding #1: campaignUpdateSchema used to be
// campaignCreateSchema.partial(), which kept re-applying
// websiteRequirement's create-time .default("ANY") for any PATCH body that
// omitted the field — silently resetting it. campaignUpdateSchema is now
// derived from a shared base with no defaults at all, so omission on PATCH
// means true omission.
describe("campaignUpdateSchema (PATCH omission must remain omission)", () => {
  it("omits websiteRequirement entirely from the parsed result when the PATCH body doesn't mention it", () => {
    const result = campaignUpdateSchema.parse({ leadLimit: 42 });
    expect(result).not.toHaveProperty("websiteRequirement");
    expect(result).toEqual({ leadLimit: 42 });
  });

  it("still accepts an explicit websiteRequirement change on PATCH", () => {
    const result = campaignUpdateSchema.parse({ websiteRequirement: "WITH_WEBSITE" });
    expect(result.websiteRequirement).toBe("WITH_WEBSITE");
  });

  it("accepts a completely empty PATCH body", () => {
    expect(campaignUpdateSchema.parse({})).toEqual({});
  });

  it("still only accepts the literal READY for status, nothing else", () => {
    expect(campaignUpdateSchema.safeParse({ status: "READY" }).success).toBe(true);
    expect(campaignUpdateSchema.safeParse({ status: "RUNNING" }).success).toBe(false);
    expect(campaignUpdateSchema.safeParse({ status: "COMPLETED" }).success).toBe(false);
  });
});

describe("campaignListQuerySchema", () => {
  it("rejects an invalid status filter value", () => {
    const result = campaignListQuerySchema.safeParse({ status: "NOT_A_STATUS" });
    expect(result.success).toBe(false);
  });
});

describe("leadListQuerySchema", () => {
  it("rejects an invalid lead status value", () => {
    expect(leadListQuerySchema.safeParse({ status: "SOMETHING_ELSE" }).success).toBe(false);
  });

  it("rejects an invalid recommendedService value", () => {
    expect(leadListQuerySchema.safeParse({ recommendedService: "LASER_CUTTING" }).success).toBe(false);
  });

  it("rejects a score range where minScore > maxScore", () => {
    const result = leadListQuerySchema.safeParse({ minScore: 80, maxScore: 20 });
    expect(result.success).toBe(false);
  });

  it("rejects a score outside 0-100", () => {
    expect(leadListQuerySchema.safeParse({ minScore: 150 }).success).toBe(false);
  });
});

describe("businessProviderInputSchema", () => {
  it("rejects a rating outside 0-5", () => {
    const result = businessProviderInputSchema.safeParse({
      name: "Test Business",
      category: "Bakery",
      source: "demo",
      rating: 7,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = businessProviderInputSchema.safeParse({
      name: "Test Business",
      category: "Bakery",
      source: "demo",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid website URL", () => {
    const result = businessProviderInputSchema.safeParse({
      name: "Test Business",
      category: "Bakery",
      source: "demo",
      website: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects latitude/longitude outside valid ranges", () => {
    expect(
      businessProviderInputSchema.safeParse({
        name: "Test Business",
        category: "Bakery",
        source: "demo",
        latitude: 200,
      }).success,
    ).toBe(false);
    expect(
      businessProviderInputSchema.safeParse({
        name: "Test Business",
        category: "Bakery",
        source: "demo",
        longitude: -200,
      }).success,
    ).toBe(false);
  });

  it("rejects a missing required source", () => {
    const result = businessProviderInputSchema.safeParse({ name: "Test Business", category: "Bakery" });
    expect(result.success).toBe(false);
  });
});

describe("settingsUpsertSchema", () => {
  it("accepts a normal configuration key", () => {
    expect(settingsUpsertSchema.safeParse({ key: "follow_up_delay_hours", value: 48 }).success).toBe(true);
  });

  it("rejects a secret-looking key", () => {
    expect(settingsUpsertSchema.safeParse({ key: "SOME_WEBHOOK_SECRET", value: "x" }).success).toBe(false);
    expect(settingsUpsertSchema.safeParse({ key: "api_key", value: "x" }).success).toBe(false);
  });
});

describe("aiLeadAnalysisResponseSchema", () => {
  const validResponse = {
    summary: "Established clinic with strong reviews and no website.",
    websiteNeed: 94,
    whatsappNeed: 72,
    reviewAutomationNeed: 61,
    voiceAgentNeed: 84,
    recommendedService: "WEBSITE",
    estimatedDealMin: 15000,
    estimatedDealMax: 30000,
  };

  it("accepts the documented example response", () => {
    expect(aiLeadAnalysisResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it("rejects an invalid recommendedService", () => {
    expect(aiLeadAnalysisResponseSchema.safeParse({ ...validResponse, recommendedService: "MAGIC" }).success).toBe(false);
  });

  it("rejects a need score outside 0-100", () => {
    expect(aiLeadAnalysisResponseSchema.safeParse({ ...validResponse, websiteNeed: 150 }).success).toBe(false);
  });

  it("rejects estimatedDealMax below estimatedDealMin", () => {
    expect(aiLeadAnalysisResponseSchema.safeParse({ ...validResponse, estimatedDealMin: 30000, estimatedDealMax: 15000 }).success).toBe(false);
  });
});
