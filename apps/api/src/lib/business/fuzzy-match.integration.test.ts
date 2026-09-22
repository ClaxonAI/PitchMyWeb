import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { normalizeAddress, normalizeName } from "./normalize";
import { pgTrgmFuzzyMatcher } from "./fuzzy-match";
import { uniqueIndianPhone } from "../testing/db-test-helpers";

// The one piece of the dedup engine that genuinely can't be faked: proves
// the pg_trgm extension + GIN trigram indexes (packages/db/prisma/
// migrations/*_phase2_business_dedup) actually score similarity the way
// lib/business/dedupe.ts's cascade assumes, against a real Postgres
// database — not just that the SQL parses against a stub.

const createdBusinessIds: string[] = [];
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
  await prisma.$disconnect();
});

async function seedBusiness(name: string, address: string) {
  const business = await prisma.business.create({
    data: {
      name,
      category: "Bakery",
      address,
      city: "Chennai",
      phone: uniqueIndianPhone(),
      source: "demo",
      externalId: `fuzzy-match-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      normalizedName: normalizeName(name),
      normalizedAddress: normalizeAddress(address),
    },
  });
  createdBusinessIds.push(business.id);
  return business;
}

describe("pgTrgmFuzzyMatcher.findFuzzyCandidates (real Postgres)", () => {
  it("scores a near-duplicate name/address highly", async () => {
    const seeded = await seedBusiness("Sri Lakshmi Bakery", "12 MG Road");

    const candidates = await pgTrgmFuzzyMatcher.findFuzzyCandidates(prisma, {
      name: "Sree Lakshmi Bakery",
      category: "Bakery",
      address: "12 M G Road",
      city: "Chennai",
      phone: null,
      email: null,
      website: null,
      instagram: null,
      facebook: null,
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      source: "demo",
      externalId: null,
      normalizedName: normalizeName("Sree Lakshmi Bakery"),
      normalizedPhone: null,
      normalizedAddress: normalizeAddress("12 M G Road"),
      normalizedDomain: null,
      phoneType: null,
    });

    const match = candidates.find((c) => c.business.id === seeded.id);
    expect(match).toBeDefined();
    expect(match!.nameScore).toBeGreaterThan(0.3);
    expect(match!.addressScore).toBeGreaterThan(0.3);
    expect(match!.combinedScore).toBeGreaterThan(0);
  });

  it("scores an unrelated name/address near zero", async () => {
    await seedBusiness("Sri Lakshmi Bakery", "12 MG Road");

    const candidates = await pgTrgmFuzzyMatcher.findFuzzyCandidates(prisma, {
      name: "Zephyr Aerospace Consulting",
      category: "Consulting",
      address: "900 Industrial Parkway",
      city: "Chennai",
      phone: null,
      email: null,
      website: null,
      instagram: null,
      facebook: null,
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      source: "demo",
      externalId: null,
      normalizedName: normalizeName("Zephyr Aerospace Consulting"),
      normalizedPhone: null,
      normalizedAddress: normalizeAddress("900 Industrial Parkway"),
      normalizedDomain: null,
      phoneType: null,
    });

    // Postgres's own `%` trigram operator (used in the WHERE clause) is
    // itself a similarity threshold — a sufficiently unrelated name is
    // expected to be excluded from the candidate list entirely, which is
    // the real-world equivalent of "scores near zero".
    expect(candidates).toHaveLength(0);
  });

  it("excludes merged-away businesses from candidate search", async () => {
    const winner = await seedBusiness("Other Bakery", "2 Test Street");
    const loser = await seedBusiness("Merged Away Bakery", "1 Test Street");
    await prisma.business.update({ where: { id: loser.id }, data: { mergedIntoId: winner.id } });

    const candidates = await pgTrgmFuzzyMatcher.findFuzzyCandidates(prisma, {
      name: "Merged Away Bakery",
      category: "Bakery",
      address: "1 Test Street",
      city: "Chennai",
      phone: null,
      email: null,
      website: null,
      instagram: null,
      facebook: null,
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      source: "demo",
      externalId: null,
      normalizedName: normalizeName("Merged Away Bakery"),
      normalizedPhone: null,
      normalizedAddress: normalizeAddress("1 Test Street"),
      normalizedDomain: null,
      phoneType: null,
    });

    expect(candidates.find((c) => c.business.id === loser.id)).toBeUndefined();
  });
});
