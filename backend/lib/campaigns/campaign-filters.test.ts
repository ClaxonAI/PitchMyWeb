import { describe, expect, it } from "vitest";
import { matchesCampaignFilters, matchesWebsiteRequirement } from "./campaign-filters";
import type { BusinessProviderInput } from "../validation/business";
import type { CampaignFilterCriteria } from "./campaign-filters";

const business: BusinessProviderInput = {
  name: "Test Business",
  category: "Dental Clinic",
  address: "12 Main Street",
  city: "Chennai",
  phone: "+91-1",
  email: null,
  website: "https://example.com",
  instagram: null,
  facebook: null,
  rating: 4.5,
  reviewCount: 100,
  latitude: null,
  longitude: null,
  source: "demo",
  externalId: "x-1",
};

const criteria: CampaignFilterCriteria = {
  location: "Chennai",
  category: "Dental Clinic",
  minRating: null,
  minReviews: null,
  websiteRequirement: "ANY",
};

describe("matchesWebsiteRequirement", () => {
  it("ANY imposes no constraint regardless of website presence", () => {
    expect(matchesWebsiteRequirement({ ...business, website: "https://x.com" }, "ANY")).toBe(true);
    expect(matchesWebsiteRequirement({ ...business, website: null }, "ANY")).toBe(true);
  });

  it("WITH_WEBSITE requires a non-empty website", () => {
    expect(matchesWebsiteRequirement({ ...business, website: "https://x.com" }, "WITH_WEBSITE")).toBe(true);
    expect(matchesWebsiteRequirement({ ...business, website: null }, "WITH_WEBSITE")).toBe(false);
    expect(matchesWebsiteRequirement({ ...business, website: "" }, "WITH_WEBSITE")).toBe(false);
  });

  it("WITHOUT_WEBSITE requires the absence of a website", () => {
    expect(matchesWebsiteRequirement({ ...business, website: null }, "WITHOUT_WEBSITE")).toBe(true);
    expect(matchesWebsiteRequirement({ ...business, website: "https://x.com" }, "WITHOUT_WEBSITE")).toBe(false);
  });
});

describe("matchesCampaignFilters", () => {
  it("matches when every criterion is satisfied", () => {
    expect(matchesCampaignFilters(business, criteria)).toBe(true);
  });

  it("category match is a case-insensitive substring, not an exact match", () => {
    expect(matchesCampaignFilters(business, { ...criteria, category: "dental" })).toBe(true);
    expect(matchesCampaignFilters(business, { ...criteria, category: "Restaurant" })).toBe(false);
  });

  it("location matches against city or address, case-insensitively", () => {
    expect(matchesCampaignFilters(business, { ...criteria, location: "chennai" })).toBe(true);
    expect(matchesCampaignFilters(business, { ...criteria, location: "Main Street" })).toBe(true); // address match
    expect(matchesCampaignFilters(business, { ...criteria, location: "Mumbai" })).toBe(false);
  });

  it("rejects a business with no city/address at all when location is required", () => {
    expect(matchesCampaignFilters({ ...business, city: null, address: null }, criteria)).toBe(false);
  });

  it("minRating and minReviews are inclusive floors", () => {
    expect(matchesCampaignFilters(business, { ...criteria, minRating: 4.5 })).toBe(true);
    expect(matchesCampaignFilters(business, { ...criteria, minRating: 4.51 })).toBe(false);
    expect(matchesCampaignFilters(business, { ...criteria, minReviews: 100 })).toBe(true);
    expect(matchesCampaignFilters(business, { ...criteria, minReviews: 101 })).toBe(false);
  });

  it("a business with no rating/reviews on file fails any positive floor (never treated as passing)", () => {
    const noData = { ...business, rating: null, reviewCount: null };
    expect(matchesCampaignFilters(noData, { ...criteria, minRating: 1 })).toBe(false);
    expect(matchesCampaignFilters(noData, { ...criteria, minReviews: 1 })).toBe(false);
    // but with no floor requested at all, missing data is fine
    expect(matchesCampaignFilters(noData, criteria)).toBe(true);
  });

  it("websiteRequirement participates in the combined check", () => {
    expect(matchesCampaignFilters(business, { ...criteria, websiteRequirement: "WITH_WEBSITE" })).toBe(true);
    expect(matchesCampaignFilters(business, { ...criteria, websiteRequirement: "WITHOUT_WEBSITE" })).toBe(false);
  });
});
