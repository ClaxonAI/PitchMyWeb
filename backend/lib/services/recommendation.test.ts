import { describe, expect, it } from "vitest";
import { recommendService, type RecommendationInput } from "./recommendation";

const base: RecommendationInput = {
  category: "Generic Business",
  rating: 4,
  reviewCount: 50,
  website: "https://example.com",
  instagram: "https://instagram.com/x",
  facebook: "https://facebook.com/x",
  phone: "+91-9800000000",
  email: "a@b.com",
};

describe("recommendService", () => {
  it("recommends WEBSITE when there is no website, regardless of other signals", () => {
    const result = recommendService({ ...base, website: null });
    expect(result.service).toBe("WEBSITE");
  });

  it("recommends WEBSITE_REDESIGN for an outdated website", () => {
    const result = recommendService({ ...base, websiteOutdated: true });
    expect(result.service).toBe("WEBSITE_REDESIGN");
  });

  it("recommends APPOINTMENT_SYSTEM for appointment-style categories with a current website", () => {
    const result = recommendService({ ...base, category: "Dental Clinic" });
    expect(result.service).toBe("APPOINTMENT_SYSTEM");
  });

  it("recommends DIGITAL_MENU for food-service categories with a current website", () => {
    const result = recommendService({ ...base, category: "Restaurant" });
    expect(result.service).toBe("DIGITAL_MENU");
  });

  it("recommends REVIEWS when review count is low", () => {
    const result = recommendService({ ...base, category: "Generic Business", reviewCount: 2 });
    expect(result.service).toBe("REVIEWS");
  });

  it("recommends SEO when there is no social presence", () => {
    const result = recommendService({ ...base, instagram: null, facebook: null });
    expect(result.service).toBe("SEO");
  });

  it("falls back to WHATSAPP when no other rule matches", () => {
    const result = recommendService(base);
    expect(result.service).toBe("WHATSAPP");
  });

  it("prioritizes WEBSITE over every other signal", () => {
    const result = recommendService({
      ...base,
      website: null,
      category: "Dental Clinic",
      reviewCount: 0,
      instagram: null,
      facebook: null,
    });
    expect(result.service).toBe("WEBSITE");
  });
});
