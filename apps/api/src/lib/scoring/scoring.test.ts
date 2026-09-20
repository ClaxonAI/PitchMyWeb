import { describe, expect, it } from "vitest";
import {
  SIGNAL_MAX_POINTS,
  calculateOpportunitySignals,
  calculateOpportunityScore,
  classifyScore,
  scoreBusinessValue,
  scoreContactAvailability,
  scoreDataQuality,
  scoreLocalDemand,
  scoreRating,
  scoreReviewVolume,
  scoreSocialPresence,
  scoreWebsiteGap,
  type BusinessScoringInput,
} from "./scoring";

const emptyBusiness: BusinessScoringInput = {
  rating: null,
  reviewCount: null,
  website: null,
  instagram: null,
  facebook: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  latitude: null,
  longitude: null,
};

describe("signal allocations sum to exactly 100", () => {
  it("max points across all signals equals 100", () => {
    const total = Object.values(SIGNAL_MAX_POINTS).reduce((sum, points) => sum + points, 0);
    expect(total).toBe(100);
  });
});

describe("classifyScore boundaries", () => {
  const cases: Array<[number, string]> = [
    [0, "IGNORE"],
    [39, "IGNORE"],
    [40, "LOW"],
    [59, "LOW"],
    [60, "MEDIUM"],
    [74, "MEDIUM"],
    [75, "STRONG"],
    [89, "STRONG"],
    [90, "EXCELLENT"],
    [100, "EXCELLENT"],
  ];

  it.each(cases)("classifies %i as %s", (score, expected) => {
    expect(classifyScore(score)).toBe(expected);
  });
});

describe("scoreRating", () => {
  it("returns 0 for no rating on file (never invents a rating)", () => {
    expect(scoreRating(null)).toBe(0);
  });

  it("returns full points for a perfect 5-star rating", () => {
    expect(scoreRating(5)).toBe(15);
  });

  it("returns 0 for a 0-star rating", () => {
    expect(scoreRating(0)).toBe(0);
  });

  it("scales linearly for a mid-range rating", () => {
    expect(scoreRating(2.5)).toBe(8); // round(2.5/5 * 15) = round(7.5) = 8
  });
});

describe("scoreReviewVolume", () => {
  it("returns 0 for null or zero reviews", () => {
    expect(scoreReviewVolume(null)).toBe(0);
    expect(scoreReviewVolume(0)).toBe(0);
  });

  it("steps up through each documented tier boundary", () => {
    expect(scoreReviewVolume(1)).toBe(3);
    expect(scoreReviewVolume(10)).toBe(3);
    expect(scoreReviewVolume(11)).toBe(7);
    expect(scoreReviewVolume(50)).toBe(7);
    expect(scoreReviewVolume(51)).toBe(11);
    expect(scoreReviewVolume(150)).toBe(11);
    expect(scoreReviewVolume(151)).toBe(15);
    expect(scoreReviewVolume(10_000)).toBe(15);
  });
});

describe("scoreWebsiteGap", () => {
  it("awards full points when there is no website", () => {
    expect(scoreWebsiteGap(false)).toBe(25);
  });

  it("awards zero points when a website exists", () => {
    expect(scoreWebsiteGap(true)).toBe(0);
  });
});

describe("scoreSocialPresence", () => {
  it("scores 0/1/2 social channels", () => {
    expect(scoreSocialPresence(0)).toBe(0);
    expect(scoreSocialPresence(1)).toBe(6);
    expect(scoreSocialPresence(2)).toBe(10);
  });
});

describe("scoreContactAvailability", () => {
  it("scores 0/1/2 contact channels", () => {
    expect(scoreContactAvailability(0)).toBe(0);
    expect(scoreContactAvailability(1)).toBe(6);
    expect(scoreContactAvailability(2)).toBe(10);
  });
});

describe("scoreBusinessValue", () => {
  it("uses the coarse 3-tier reviewCount proxy", () => {
    expect(scoreBusinessValue(null)).toBe(3);
    expect(scoreBusinessValue(0)).toBe(3);
    expect(scoreBusinessValue(10)).toBe(3);
    expect(scoreBusinessValue(11)).toBe(7);
    expect(scoreBusinessValue(100)).toBe(7);
    expect(scoreBusinessValue(101)).toBe(10);
  });
});

describe("scoreLocalDemand", () => {
  it("returns the documented neutral default until real demand data exists", () => {
    expect(scoreLocalDemand()).toBe(5);
  });
});

describe("scoreDataQuality", () => {
  it("returns 0 for a completely empty record", () => {
    expect(scoreDataQuality(emptyBusiness)).toBe(0);
  });

  it("returns full points for a fully populated record", () => {
    expect(
      scoreDataQuality({
        ...emptyBusiness,
        address: "1 Main St",
        city: "Chennai",
        phone: "+91-9800000000",
        email: "a@b.com",
        rating: 4.5,
        reviewCount: 10,
        latitude: 1,
        longitude: 1,
      }),
    ).toBe(5);
  });
});

describe("calculateOpportunityScore", () => {
  it("never exceeds 100 for a maximally strong business", () => {
    const result = calculateOpportunityScore({
      ...emptyBusiness,
      rating: 5,
      reviewCount: 500,
      website: null,
      instagram: "https://instagram.com/x",
      facebook: "https://facebook.com/x",
      phone: "+91-9800000000",
      email: "a@b.com",
      address: "1 Main St",
      city: "Chennai",
      latitude: 1,
      longitude: 1,
    });
    expect(result.total).toBeLessThanOrEqual(100);
    // 95, not 100: localDemand is a fixed neutral-default signal (see
    // scoreLocalDemand) that never reaches its 10-point max until a real
    // local-demand data source exists, so 95 is the true current ceiling
    // for a business with no website plus max everything else.
    expect(result.total).toBe(95);
    expect(result.classification).toBe("EXCELLENT");
  });

  it("can reach the full 100 only once every signal (including the current localDemand placeholder) is at its max", () => {
    const total = Object.values(
      calculateOpportunitySignals({
        ...emptyBusiness,
        rating: 5,
        reviewCount: 500,
        website: null,
        instagram: "https://instagram.com/x",
        facebook: "https://facebook.com/x",
        phone: "+91-9800000000",
        email: "a@b.com",
        address: "1 Main St",
        city: "Chennai",
        latitude: 1,
        longitude: 1,
      }),
    ).reduce((sum, points) => sum + points, 0);
    // Documents the current ceiling explicitly: 100 is only reachable once
    // scoreLocalDemand stops being a flat constant.
    expect(total).toBe(95);
  });

  it("never falls below 0 for a completely empty business", () => {
    const result = calculateOpportunityScore(emptyBusiness);
    expect(result.total).toBeGreaterThanOrEqual(0);
    // website gap (25, no site) + business value floor (3) + local demand
    // default (5) still apply even with zero data on file.
    expect(result.total).toBe(33);
    expect(result.classification).toBe("IGNORE");
  });

  it("returns a breakdown whose signals sum to the total", () => {
    const result = calculateOpportunityScore({ ...emptyBusiness, rating: 4, reviewCount: 20 });
    const sum = Object.values(result.breakdown).reduce((s, v) => s + v, 0);
    expect(sum).toBe(result.total);
  });
});
