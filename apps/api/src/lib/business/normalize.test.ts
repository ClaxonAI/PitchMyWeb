import { describe, expect, it } from "vitest";
import type { BusinessProviderInput } from "../validation/business";
import { normalizeAddress, normalizeBusinessInput, normalizeDomain, normalizeName, normalizePhone } from "./normalize";

const rawInput: BusinessProviderInput = {
  name: "  Lakshmi   Dental   Care  ",
  category: "  Dental Clinic ",
  address: "  12 MG Road ",
  city: "Chennai",
  phone: " +91-9800000001 ",
  email: "  Contact@LakshmiDental.example.com ",
  website: null,
  instagram: null,
  facebook: null,
  rating: 4.849,
  reviewCount: 240.9,
  latitude: 13.0827,
  longitude: 80.2707,
  source: "  Demo ",
  externalId: "demo-001",
};

describe("normalizeBusinessInput", () => {
  it("trims and collapses whitespace in text fields", () => {
    const result = normalizeBusinessInput(rawInput);
    expect(result.name).toBe("Lakshmi Dental Care");
    expect(result.category).toBe("Dental Clinic");
    expect(result.address).toBe("12 MG Road");
  });

  it("lowercases email", () => {
    const result = normalizeBusinessInput(rawInput);
    expect(result.email).toBe("contact@lakshmidental.example.com");
  });

  it("lowercases source (half of the dedup key) but preserves externalId case", () => {
    const result = normalizeBusinessInput({ ...rawInput, source: "DEMO", externalId: "Demo-001" });
    expect(result.source).toBe("demo");
    expect(result.externalId).toBe("Demo-001");
  });

  it("rounds rating to 1 decimal and clamps to [0, 5]", () => {
    expect(normalizeBusinessInput({ ...rawInput, rating: 4.849 }).rating).toBe(4.8);
    expect(normalizeBusinessInput({ ...rawInput, rating: 5.5 }).rating).toBe(5);
    expect(normalizeBusinessInput({ ...rawInput, rating: -1 }).rating).toBe(0);
  });

  it("floors reviewCount and clamps to >= 0", () => {
    expect(normalizeBusinessInput({ ...rawInput, reviewCount: 240.9 }).reviewCount).toBe(240);
    expect(normalizeBusinessInput({ ...rawInput, reviewCount: -5 }).reviewCount).toBe(0);
  });

  it("converts empty/whitespace-only optional fields to null instead of empty strings", () => {
    const result = normalizeBusinessInput({ ...rawInput, address: "   ", phone: null });
    expect(result.address).toBeNull();
    expect(result.phone).toBeNull();
  });

  it("is deterministic: same input always produces the same output", () => {
    expect(normalizeBusinessInput(rawInput)).toEqual(normalizeBusinessInput(rawInput));
  });

  it("never invents a value for a field the provider did not supply", () => {
    const result = normalizeBusinessInput({ ...rawInput, rating: null, reviewCount: null, website: null });
    expect(result.rating).toBeNull();
    expect(result.reviewCount).toBeNull();
    expect(result.website).toBeNull();
  });

  it("also derives the four Phase 2 dedup-cascade normalized fields", () => {
    const result = normalizeBusinessInput(rawInput);
    expect(result.normalizedName).toBe("lakshmi dental care");
    expect(result.normalizedPhone).toBe("+919800000001");
    expect(result.normalizedAddress).toBe("12 mg road");
    expect(result.normalizedDomain).toBeNull(); // rawInput.website is null
  });
});

describe("normalizeName", () => {
  it("lowercases, collapses whitespace, and strips punctuation", () => {
    expect(normalizeName("  Lakshmi   Dental,  Care!  ")).toBe("lakshmi dental care");
  });

  it("strips common legal-entity suffixes", () => {
    expect(normalizeName("Acme Pvt Ltd")).toBe("acme");
    expect(normalizeName("Acme Private Limited")).toBe("acme");
    expect(normalizeName("Acme LLC")).toBe("acme");
    expect(normalizeName("Acme Inc.")).toBe("acme");
  });
});

describe("normalizePhone", () => {
  it("parses a valid Indian number (with or without the country code) to E.164", () => {
    expect(normalizePhone("+91-9800000001")).toBe("+919800000001");
    expect(normalizePhone("9800000001")).toBe("+919800000001"); // defaultRegion IN
  });

  it("parses a valid non-Indian number given its own country code", () => {
    expect(normalizePhone("+1-202-555-0100")).toBe("+12025550100");
  });

  it("returns null for unparseable input, never a guess", () => {
    expect(normalizePhone("not a phone number")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("normalizeAddress", () => {
  it("lowercases and collapses punctuation/whitespace", () => {
    expect(normalizeAddress("12, M.G.  Road")).toBe("12 m g road");
  });

  it("returns null for null input", () => {
    expect(normalizeAddress(null)).toBeNull();
  });
});

describe("normalizeDomain", () => {
  it("extracts the lowercased hostname, stripping a leading www.", () => {
    expect(normalizeDomain("https://www.Example.com/menu")).toBe("example.com");
    expect(normalizeDomain("http://example.com")).toBe("example.com");
  });

  it("returns null for an unparseable URL, never a guess", () => {
    expect(normalizeDomain("not a url")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizeDomain(null)).toBeNull();
  });
});
