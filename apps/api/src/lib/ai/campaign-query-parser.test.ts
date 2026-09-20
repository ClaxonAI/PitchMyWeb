import { describe, expect, it } from "vitest";
import { NullCampaignQueryParser, OpenAiCampaignQueryParser } from "./campaign-query-parser";

describe("OpenAiCampaignQueryParser", () => {
  it("returns structured fields from a successful invoke", async () => {
    const parser = new OpenAiCampaignQueryParser(async () => ({
      category: "Dental Clinic",
      location: "Chennai",
      websiteRequirement: "WITHOUT_WEBSITE",
      targetCount: 20,
    }));
    await expect(parser.parse("dentists in Chennai with no website")).resolves.toEqual({
      category: "Dental Clinic",
      location: "Chennai",
      websiteRequirement: "WITHOUT_WEBSITE",
      targetCount: 20,
    });
  });

  it("returns null on malformed output instead of throwing", async () => {
    const parser = new OpenAiCampaignQueryParser(async () => ({ minRating: "hot" }));
    await expect(parser.parse("anything")).resolves.toBeNull();
  });

  it("returns null when the chain throws", async () => {
    const parser = new OpenAiCampaignQueryParser(async () => {
      throw new Error("rate limited");
    });
    await expect(parser.parse("anything")).resolves.toBeNull();
  });
});

describe("NullCampaignQueryParser", () => {
  it("always returns null", async () => {
    await expect(new NullCampaignQueryParser().parse("dentists in Pune")).resolves.toBeNull();
  });
});
