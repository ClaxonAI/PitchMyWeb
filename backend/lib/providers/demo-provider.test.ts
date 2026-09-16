import { describe, expect, it } from "vitest";
import { DemoProvider, type CampaignSearchInput } from "./demo-provider";

const baseInput: CampaignSearchInput = {
  location: "Chennai",
  category: "Dental Clinic",
  radius: null,
  minRating: null,
  minReviews: null,
  websiteRequirement: "ANY",
  leadLimit: 10,
};

describe("DemoProvider", () => {
  it("returns only fictional, deterministic fixture data (never real customer/business data)", async () => {
    const results = await new DemoProvider().search(baseInput);
    for (const business of results) {
      expect(business.source).toBe("demo");
      expect(business.externalId).toMatch(/^campaign-demo-\d+$/);
    }
  });

  it("is deterministic: the same input always returns the same result", async () => {
    const provider = new DemoProvider();
    const first = await provider.search(baseInput);
    const second = await provider.search(baseInput);
    expect(first).toEqual(second);
  });

  it("filters by category (substring, case-insensitive)", async () => {
    const results = await new DemoProvider().search({ ...baseInput, category: "restaurant", location: "Bengaluru" });
    expect(results.every((b) => b.category.toLowerCase().includes("restaurant"))).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("filters by location (city/address substring)", async () => {
    const results = await new DemoProvider().search({ ...baseInput, category: "e", location: "Chennai" });
    expect(results.length).toBeGreaterThan(0);
    for (const business of results) {
      expect(business.city).toBe("Chennai");
    }
  });

  it("filters by minRating and minReviews", async () => {
    const highBar = await new DemoProvider().search({ ...baseInput, category: "e", location: "", minRating: 4.6 });
    expect(highBar.every((b) => (b.rating ?? 0) >= 4.6)).toBe(true);

    const reviewBar = await new DemoProvider().search({ ...baseInput, category: "e", location: "", minReviews: 100 });
    expect(reviewBar.every((b) => (b.reviewCount ?? 0) >= 100)).toBe(true);
  });

  it("filters by websiteRequirement", async () => {
    const withSite = await new DemoProvider().search({ ...baseInput, category: "e", location: "", websiteRequirement: "WITH_WEBSITE" });
    expect(withSite.every((b) => !!b.website)).toBe(true);
    expect(withSite.length).toBeGreaterThan(0);

    const withoutSite = await new DemoProvider().search({ ...baseInput, category: "e", location: "", websiteRequirement: "WITHOUT_WEBSITE" });
    expect(withoutSite.every((b) => !b.website)).toBe(true);
    expect(withoutSite.length).toBeGreaterThan(0);
  });

  it("does NOT slice results to leadLimit — that's the execution service's responsibility, not the provider's", async () => {
    const results = await new DemoProvider().search({ ...baseInput, category: "e", location: "", leadLimit: 1 });
    expect(results.length).toBeGreaterThan(1);
  });

  it("returns an empty array (not an error) when nothing matches", async () => {
    const results = await new DemoProvider().search({ ...baseInput, category: "Nonexistent Category XYZ" });
    expect(results).toEqual([]);
  });
});
