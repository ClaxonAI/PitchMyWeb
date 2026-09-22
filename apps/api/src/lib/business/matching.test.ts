import { describe, expect, it, vi } from "vitest";
import type { Business, Prisma } from "@pitchmyweb/db";
import { findExactDomainMatch, findExactNameCityMatch, findExactPhoneMatch, isCorroborated } from "./matching";
import type { NormalizedBusiness } from "./normalize";

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: "business-1",
    name: "Lakshmi Dental Care",
    category: "Dental Clinic",
    address: "12 MG Road",
    city: "Chennai",
    phone: "+919800000001",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.8,
    reviewCount: 240,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: "demo-001",
    normalizedName: "lakshmi dental care",
    normalizedPhone: "+919800000001",
    normalizedAddress: "12 mg road",
    normalizedDomain: null,
    phoneType: null,
    mergedIntoId: null,
    websiteVerificationStatus: "UNVERIFIED",
    websiteVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function normalized(overrides: Partial<NormalizedBusiness> = {}): NormalizedBusiness {
  return {
    name: "Lakshmi Dental Care",
    category: "Dental Clinic",
    address: "12 MG Road",
    city: "Chennai",
    phone: "+919800000001",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.8,
    reviewCount: 240,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: "demo-002",
    normalizedName: "lakshmi dental care",
    normalizedPhone: "+919800000001",
    normalizedAddress: "12 mg road",
    normalizedDomain: null,
    phoneType: null,
    ...overrides,
  };
}

// Fake standing in for the Business table, only implementing findFirst
// (all three matching.ts lookups compile to findFirst) — proves the
// WHERE-clause shape (including the mergedIntoId exclusion) is correct.
function createFakeDb(rows: Business[]) {
  const client = {
    business: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          rows.find((row) => {
            for (const [key, value] of Object.entries(where)) {
              if ((row as Record<string, unknown>)[key] !== value) return false;
            }
            return true;
          }) ?? null
        );
      }),
    },
  };
  return client as unknown as Prisma.TransactionClient & typeof client;
}

describe("findExactPhoneMatch", () => {
  it("returns null without querying when normalizedPhone is null", async () => {
    const db = createFakeDb([business()]);
    expect(await findExactPhoneMatch(db, null)).toBeNull();
    expect(db.business.findFirst).not.toHaveBeenCalled();
  });

  it("finds a business with the exact normalized phone", async () => {
    const target = business();
    const db = createFakeDb([target]);
    expect(await findExactPhoneMatch(db, "+919800000001")).toEqual(target);
  });

  it("excludes merged-away businesses", async () => {
    const merged = business({ mergedIntoId: "business-winner" });
    const db = createFakeDb([merged]);
    expect(await findExactPhoneMatch(db, "+919800000001")).toBeNull();
  });
});

describe("findExactDomainMatch", () => {
  it("returns null without querying when normalizedDomain is null", async () => {
    const db = createFakeDb([business({ normalizedDomain: "example.com" })]);
    expect(await findExactDomainMatch(db, null)).toBeNull();
  });

  it("finds a business with the exact normalized domain", async () => {
    const target = business({ normalizedDomain: "example.com" });
    const db = createFakeDb([target]);
    expect(await findExactDomainMatch(db, "example.com")).toEqual(target);
  });
});

describe("findExactNameCityMatch", () => {
  it("returns null when city is null (nothing to corroborate against)", async () => {
    const db = createFakeDb([business()]);
    expect(await findExactNameCityMatch(db, "lakshmi dental care", null)).toBeNull();
  });

  it("finds a business with the exact normalized name and city", async () => {
    const target = business();
    const db = createFakeDb([target]);
    expect(await findExactNameCityMatch(db, "lakshmi dental care", "Chennai")).toEqual(target);
  });
});

describe("isCorroborated", () => {
  const db = createFakeDb([]);

  it("is corroborated by an equal, non-null city, without ever calling the similarity function", async () => {
    const similarity = vi.fn();
    const result = await isCorroborated(db, normalized({ city: "Chennai" }), business({ city: "Chennai" }), similarity);
    expect(result).toBe(true);
    expect(similarity).not.toHaveBeenCalled();
  });

  it("is not corroborated by city when cities differ", async () => {
    const similarity = vi.fn().mockResolvedValue(0);
    const result = await isCorroborated(db, normalized({ city: "Chennai" }), business({ city: "Mumbai" }), similarity);
    expect(result).toBe(false);
  });

  it("falls back to name similarity when city doesn't corroborate, and is corroborated at/above the 0.35 floor", async () => {
    const similarity = vi.fn().mockResolvedValue(0.35);
    const result = await isCorroborated(db, normalized({ city: null }), business({ city: null }), similarity);
    expect(result).toBe(true);
    expect(similarity).toHaveBeenCalledWith(db, "lakshmi dental care", "lakshmi dental care");
  });

  it("is not corroborated when name similarity is below the 0.35 floor and city doesn't match", async () => {
    const similarity = vi.fn().mockResolvedValue(0.34);
    const result = await isCorroborated(db, normalized({ city: null }), business({ city: null }), similarity);
    expect(result).toBe(false);
  });

  it("is not corroborated when either side has no normalizedName", async () => {
    const similarity = vi.fn();
    const result = await isCorroborated(db, normalized({ city: null, normalizedName: null }), business({ city: null }), similarity);
    expect(result).toBe(false);
    expect(similarity).not.toHaveBeenCalled();
  });
});
