import { describe, expect, it, vi } from "vitest";
import { SerperSource } from "./serper";
import type { EnrichmentClient } from "../ai/enrichment";

const baseQuery = { location: "Pune", category: "dentist", radius: null, minRating: null, minReviews: null, leadLimit: 10 };

function stubEnrichment(overrides: Partial<EnrichmentClient> = {}): EnrichmentClient {
  return {
    enrich: vi.fn(async () => ({ summary: "A friendly local dentist.", services: ["Checkups", "Cleanings"], outreachMessage: "Hi there — noticed you don't have a website yet." })),
    ...overrides,
  };
}

/** A fetchImpl that returns `places` on the first Maps call only (like a
 * real single-page result set) and empty on every Maps call after that —
 * SerperSource stops paginating as soon as a page comes back empty, so
 * this keeps every test to exactly the businesses it declares. */
function fakeFetch(places: unknown[], searchResponse: unknown = { organic: [] }) {
  let mapsCalls = 0;
  const impl = vi.fn(async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("/maps")) {
      mapsCalls += 1;
      return new Response(JSON.stringify({ places: mapsCalls === 1 ? places : [], ll: "@18.5,73.8,13z" }), { status: 200 });
    }
    return new Response(JSON.stringify(searchResponse), { status: 200 });
  });
  return { impl, callCount: () => mapsCalls };
}

describe("SerperSource.search", () => {
  it("keeps only businesses with a phone and no website, mapping rating/reviewCount straight through", async () => {
    const { impl } = fakeFetch([
      { title: "Smile Dental", phoneNumber: "+911234567890", rating: 4.7, ratingCount: 82, cid: "cid-1" }, // keep: phone, no website
      { title: "Has A Website Dental", phoneNumber: "+911234567891", website: "https://hasawebsite.example.com" }, // drop: has a website
      { title: "No Phone Dental" }, // drop: no phone
    ]);

    const source = new SerperSource({ apiKey: "test-key", enrichment: stubEnrichment(), enrichmentModelName: "gpt-4o-mini", fetchImpl: impl });
    const result = await source.search(baseQuery);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Smile Dental",
      category: "dentist",
      city: "Pune",
      phone: "+911234567890",
      website: null,
      rating: 4.7,
      reviewCount: 82,
      source: "serper",
      externalId: "cid-1",
    });
  });

  it("attaches AI insights and social links found for the business", async () => {
    const { impl } = fakeFetch([{ title: "Smile Dental", phoneNumber: "+911234567890" }], {
      organic: [{ link: "https://instagram.com/smiledental" }, { link: "https://facebook.com/smiledental" }],
    });

    const enrichment = stubEnrichment();
    const source = new SerperSource({ apiKey: "test-key", enrichment, enrichmentModelName: "gpt-4o-mini", fetchImpl: impl });
    const result = await source.search(baseQuery);

    expect(result).toHaveLength(1);
    const [business] = result;
    expect(enrichment.enrich).toHaveBeenCalledWith({ name: "Smile Dental", category: "dentist", rating: null, reviewCount: null });
    expect(business?.instagram).toBe("https://instagram.com/smiledental");
    expect(business?.facebook).toBe("https://facebook.com/smiledental");
    expect(business?.insights).toEqual({
      summary: "A friendly local dentist.",
      services: ["Checkups", "Cleanings"],
      outreachMessage: "Hi there — noticed you don't have a website yet.",
      model: "gpt-4o-mini",
    });
  });

  it("still returns the business with insights: null when AI enrichment fails or is unset", async () => {
    const { impl } = fakeFetch([{ title: "Smile Dental", phoneNumber: "+911234567890" }]);

    const enrichment = stubEnrichment({ enrich: vi.fn(async () => null) });
    const source = new SerperSource({ apiKey: "test-key", enrichment, enrichmentModelName: null, fetchImpl: impl });
    const result = await source.search(baseQuery);

    expect(result).toHaveLength(1);
    expect(result[0]?.insights).toBeNull();
  });

  it("filters out results below minRating/minReviews", async () => {
    const { impl } = fakeFetch([
      { title: "Low Rated Dental", phoneNumber: "+911234567890", rating: 3.0, ratingCount: 5 },
      { title: "Good Dental", phoneNumber: "+911234567891", rating: 4.8, ratingCount: 50 },
    ]);

    const source = new SerperSource({ apiKey: "test-key", enrichment: stubEnrichment(), enrichmentModelName: null, fetchImpl: impl });
    const result = await source.search({ ...baseQuery, minRating: 4, minReviews: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Good Dental");
  });

  it("stops paginating once a page returns no places", async () => {
    const { impl, callCount } = fakeFetch([{ title: "Only Dental", phoneNumber: "+911234567890" }]);

    const source = new SerperSource({ apiKey: "test-key", enrichment: stubEnrichment(), enrichmentModelName: null, fetchImpl: impl });
    await source.search({ ...baseQuery, leadLimit: 50 });

    expect(callCount()).toBe(2); // page 1 (1 result, keeps going), page 2 (empty, stops)
  });
});
