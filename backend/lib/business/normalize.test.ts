import { describe, expect, it } from "vitest";
import type { BusinessProviderInput } from "../validation/business";
import { normalizeBusinessInput } from "./normalize";

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
});
