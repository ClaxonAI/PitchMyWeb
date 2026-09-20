import { describe, expect, it } from "vitest";
import type { Business, Prisma } from "@pitchmyweb/db";
import { normalizeBusinessInput } from "./normalize";
import { resolveBusiness, upsertCanonicalBusiness } from "./dedupe";
import type { BusinessProviderInput } from "../validation/business";

// Fake standing in for the Business table, keyed exactly like the real
// @@unique([source, externalId]) constraint from Phase 1, so this proves
// upsertCanonicalBusiness's *usage* of that key is correct. It does not
// replace a real Postgres constraint test — the doc explicitly treats the
// database constraint as the final protection (section 22/37), and a true
// concurrent-write race test belongs to the Phase 7 integration suite
// against a live database.
function createFakeBusinessDb() {
  const rows = new Map<string, { id: string; [key: string]: unknown }>();
  let nextId = 1;

  const client = {
    business: {
      upsert: async ({ where, create, update }: { where: { source_externalId: { source: string; externalId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = `${where.source_externalId.source}::${where.source_externalId.externalId}`;
        const existing = rows.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          rows.set(key, updated);
          return updated;
        }
        const created = { id: `business-${nextId++}`, ...create };
        rows.set(key, created);
        return created;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `business-${nextId++}`, ...data };
        rows.set(`no-external-id::${created.id}`, created);
        return created;
      },
    },
  };

  return { db: client as unknown as Prisma.TransactionClient, size: () => rows.size };
}

const providerInput: BusinessProviderInput = {
  name: "Lakshmi Dental Care",
  category: "Dental Clinic",
  address: "12 MG Road",
  city: "Chennai",
  phone: "+91-9800000001",
  email: "contact@lakshmidental.example.com",
  website: null,
  instagram: null,
  facebook: null,
  rating: 4.8,
  reviewCount: 240,
  latitude: 13.0827,
  longitude: 80.2707,
  source: "demo",
  externalId: "demo-001",
};

describe("upsertCanonicalBusiness", () => {
  it("creates a business the first time it is seen", async () => {
    const { db, size } = createFakeBusinessDb();
    const result = await upsertCanonicalBusiness(db, normalizeBusinessInput(providerInput));
    expect(result.id).toBeDefined();
    expect(size()).toBe(1);
  });

  it("does not create a second row for the same source+externalId (duplicate discovery)", async () => {
    const { db, size } = createFakeBusinessDb();
    const first = await upsertCanonicalBusiness(db, normalizeBusinessInput(providerInput));
    const second = await upsertCanonicalBusiness(db, normalizeBusinessInput(providerInput));
    expect(size()).toBe(1);
    expect(second.id).toBe(first.id);
  });

  it("treats differently-cased source as the same provider after normalization", async () => {
    const { db, size } = createFakeBusinessDb();
    await upsertCanonicalBusiness(db, normalizeBusinessInput({ ...providerInput, source: "demo" }));
    await upsertCanonicalBusiness(db, normalizeBusinessInput({ ...providerInput, source: "DEMO" }));
    expect(size()).toBe(1);
  });

  it("treats a different externalId as a distinct business", async () => {
    const { db, size } = createFakeBusinessDb();
    await upsertCanonicalBusiness(db, normalizeBusinessInput(providerInput));
    await upsertCanonicalBusiness(db, normalizeBusinessInput({ ...providerInput, externalId: "demo-002" }));
    expect(size()).toBe(2);
  });

  it("creates a fresh row when no externalId is supplied (nothing to deduplicate against)", async () => {
    const { db, size } = createFakeBusinessDb();
    await upsertCanonicalBusiness(db, normalizeBusinessInput({ ...providerInput, externalId: null }));
    await upsertCanonicalBusiness(db, normalizeBusinessInput({ ...providerInput, externalId: null }));
    expect(size()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resolveBusiness: the full Phase 2 cascade (tiers 1-6). Fake Prisma client
// implementing exactly the surface resolveBusiness/matching.ts/fuzzy-match.ts
// touch — proves cascade *ordering* and *branching*, not real trigram
// scoring (that's fuzzy-match.integration.test.ts's job, against a real
// Postgres database).
// ---------------------------------------------------------------------------

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: "existing-business",
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
    externalId: "demo-existing",
    normalizedName: "lakshmi dental care",
    normalizedPhone: "+919800000001",
    normalizedAddress: "12 mg road",
    normalizedDomain: null,
    mergedIntoId: null,
    websiteVerificationStatus: "UNVERIFIED",
    websiteVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeIncoming(overrides: Partial<BusinessProviderInput> = {}): BusinessProviderInput {
  return {
    name: "Some New Business",
    category: "Dental Clinic",
    address: "99 Anna Salai",
    city: "Chennai",
    phone: "+919800000099",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4,
    reviewCount: 10,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: "demo-incoming",
    ...overrides,
  };
}

type CascadeFakeDbOptions = {
  businesses?: Business[];
  fuzzyCandidates?: Array<{ business: Business; nameScore: number; addressScore: number }>;
  fuzzyThreshold?: number;
};

function createCascadeFakeDb(options: CascadeFakeDbOptions = {}) {
  const businesses = new Map((options.businesses ?? []).map((b) => [b.id, { ...b }]));
  const possibleDuplicates: Array<{ id: string; businessId: string; candidateId: string; score: number; matchedFields: unknown }> = [];
  const businessSources: unknown[] = [];
  let businessSeq = 0;
  let pdSeq = 0;

  const client = {
    business: {
      findUnique: async ({ where }: { where: { source_externalId: { source: string; externalId: string } } }) => {
        for (const b of businesses.values()) {
          if (b.source === where.source_externalId.source && b.externalId === where.source_externalId.externalId) return b;
        }
        return null;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        for (const b of businesses.values()) {
          let matches = true;
          for (const [key, value] of Object.entries(where)) {
            if ((b as Record<string, unknown>)[key] !== value) matches = false;
          }
          if (matches) return b;
        }
        return null;
      },
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        businessSeq += 1;
        const business = { id: `new-business-${businessSeq}`, mergedIntoId: null, createdAt: new Date(), updatedAt: new Date(), ...create } as Business;
        businesses.set(business.id, business);
        return business;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        businessSeq += 1;
        const business = { id: `new-business-${businessSeq}`, mergedIntoId: null, createdAt: new Date(), updatedAt: new Date(), ...data } as Business;
        businesses.set(business.id, business);
        return business;
      },
    },
    businessSource: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        businessSources.push(data);
        return { id: `bs-${businessSources.length}`, ...data };
      },
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        businessSources.push(create);
        return { id: `bs-${businessSources.length}`, ...create };
      },
    },
    possibleDuplicate: {
      findFirst: async ({ where }: { where: { OR: Array<{ businessId: string; candidateId: string }> } }) => {
        return (
          possibleDuplicates.find((pd) => where.OR.some((clause) => pd.businessId === clause.businessId && pd.candidateId === clause.candidateId)) ?? null
        );
      },
      create: async ({ data }: { data: { businessId: string; candidateId: string; score: number; matchedFields: unknown } }) => {
        pdSeq += 1;
        const pd = { id: `pd-${pdSeq}`, ...data };
        possibleDuplicates.push(pd);
        return pd;
      },
    },
    settings: {
      findUnique: async () => (options.fuzzyThreshold === undefined ? null : { value: { threshold: options.fuzzyThreshold, weights: { name: 0.45, address: 0.3, phone: 0.15, domain: 0.1 } } }),
    },
    $executeRaw: async () => 0,
    $queryRaw: async () =>
      (options.fuzzyCandidates ?? []).map((c) => ({ ...c.business, nameScore: c.nameScore, addressScore: c.addressScore })),
  };

  return { tx: client as unknown as Prisma.TransactionClient, businesses, possibleDuplicates, businessSources };
}

const provenance = { source: "demo", sourceBusinessId: "demo-incoming", sourceUrl: null, rawData: {} };

describe("resolveBusiness (cascade)", () => {
  it("tier 1: exact (source, externalId) attaches without creating a new row", async () => {
    const existing = makeBusiness({ id: "existing-1", source: "demo", externalId: "demo-incoming" });
    const { tx, businesses } = createCascadeFakeDb({ businesses: [existing] });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ source: "demo", externalId: "demo-incoming" })), provenance);
    expect(result).toEqual({ business: existing, flaggedVia: null });
    expect(businesses.size).toBe(1);
  });

  it("tier 2: exact phone match corroborated by equal city attaches, no review flagged", async () => {
    const existing = makeBusiness({ id: "existing-1", normalizedPhone: "+919800000099", city: "Chennai" });
    const { tx, businesses, possibleDuplicates } = createCascadeFakeDb({ businesses: [existing] });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ externalId: null, phone: "+91-9800000099", city: "Chennai" })), provenance);
    expect(result.business.id).toBe("existing-1");
    expect(result.flaggedVia).toBeNull();
    expect(businesses.size).toBe(1);
    expect(possibleDuplicates).toHaveLength(0);
  });

  it("tier 2: exact phone match NOT corroborated creates a new business and unconditionally flags PENDING review", async () => {
    const existing = makeBusiness({ id: "existing-1", normalizedPhone: "+919800000099", city: "Mumbai", normalizedName: "totally different clinic" });
    const { tx, businesses, possibleDuplicates } = createCascadeFakeDb({ businesses: [existing] });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ externalId: null, phone: "+91-9800000099", city: "Chennai" })), provenance);
    expect(result.business.id).not.toBe("existing-1");
    expect(result.flaggedVia).toBe("EXACT_PHONE_UNCORROBORATED");
    expect(businesses.size).toBe(2);
    expect(possibleDuplicates).toHaveLength(1);
    expect(possibleDuplicates[0]).toMatchObject({ businessId: "existing-1", candidateId: result.business.id });
  });

  it("tier 3: exact domain match not corroborated creates a new business and flags PENDING review", async () => {
    const existing = makeBusiness({ id: "existing-1", normalizedPhone: null, normalizedDomain: "example.com", city: "Mumbai", normalizedName: "totally different clinic" });
    const { tx, possibleDuplicates } = createCascadeFakeDb({ businesses: [existing] });
    const result = await resolveBusiness(
      tx,
      normalizeBusinessInput(makeIncoming({ externalId: null, phone: null, website: "https://example.com", city: "Chennai" })),
      provenance,
    );
    expect(result.flaggedVia).toBe("EXACT_DOMAIN_UNCORROBORATED");
    expect(possibleDuplicates[0]?.matchedFields).toMatchObject({ flaggedVia: "EXACT_DOMAIN_UNCORROBORATED" });
  });

  it("tier 4: exact name+city attaches directly, no review needed", async () => {
    const existing = makeBusiness({ id: "existing-1", normalizedPhone: null, normalizedName: "some new business", city: "Chennai" });
    const { tx, businesses, possibleDuplicates } = createCascadeFakeDb({ businesses: [existing] });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ externalId: null, phone: null, name: "Some New Business", city: "Chennai" })), provenance);
    expect(result).toEqual({ business: existing, flaggedVia: null });
    expect(businesses.size).toBe(1);
    expect(possibleDuplicates).toHaveLength(0);
  });

  it("tier 5: fuzzy score at/above threshold creates a new business and flags PENDING review with every score component", async () => {
    const candidate = makeBusiness({ id: "fuzzy-candidate", normalizedPhone: null, normalizedName: "lakshmi dentl care", city: "Bengaluru" });
    const { tx, possibleDuplicates } = createCascadeFakeDb({
      businesses: [candidate],
      fuzzyCandidates: [{ business: candidate, nameScore: 0.9, addressScore: 0.5 }],
      fuzzyThreshold: 0.5,
    });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ externalId: null, phone: null, name: "Lakshmi Dental Care", city: "Chennai" })), provenance);
    expect(result.flaggedVia).toBe("FUZZY_THRESHOLD");
    expect(possibleDuplicates[0]?.matchedFields).toMatchObject({ flaggedVia: "FUZZY_THRESHOLD", nameScore: 0.9, addressScore: 0.5 });
    // weighted: 0.9*0.45 + 0.5*0.3 + 0 + 0 = 0.555
    expect((possibleDuplicates[0]?.matchedFields as { combinedScore: number }).combinedScore).toBeCloseTo(0.555, 5);
  });

  it("tier 5: fuzzy score below threshold falls through to tier 6 (create new, no review)", async () => {
    const candidate = makeBusiness({ id: "fuzzy-candidate", normalizedPhone: null, normalizedName: "vaguely similar clinic", city: "Bengaluru" });
    const { tx, businesses, possibleDuplicates } = createCascadeFakeDb({
      businesses: [candidate],
      fuzzyCandidates: [{ business: candidate, nameScore: 0.1, addressScore: 0.1 }],
      fuzzyThreshold: 0.5,
    });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ externalId: null, phone: null, name: "Some New Business", city: "Chennai" })), provenance);
    expect(result.flaggedVia).toBeNull();
    expect(businesses.size).toBe(2);
    expect(possibleDuplicates).toHaveLength(0);
  });

  it("tier 6: no match at all creates a new business, no review", async () => {
    const { tx, businesses, possibleDuplicates } = createCascadeFakeDb({ businesses: [] });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ externalId: null, phone: null })), provenance);
    expect(result.flaggedVia).toBeNull();
    expect(businesses.size).toBe(1);
    expect(possibleDuplicates).toHaveLength(0);
  });

  it("excludes merged-away businesses from every tier's lookup", async () => {
    const merged = makeBusiness({ id: "merged-away", normalizedPhone: "+919800000099", mergedIntoId: "winner-business" });
    const { tx, businesses } = createCascadeFakeDb({ businesses: [merged] });
    const result = await resolveBusiness(tx, normalizeBusinessInput(makeIncoming({ externalId: null, phone: "+91-9800000099" })), provenance);
    // The merged business is invisible to tier 2, so this falls all the way
    // through to tier 6 and creates a fresh row rather than "attaching" to
    // (or flagging against) a business that's been superseded.
    expect(result.business.id).not.toBe("merged-away");
    expect(businesses.size).toBe(2);
  });

  it("does not flag the same (existing, candidate) pair twice on a replayed ingestion", async () => {
    const existing = makeBusiness({ id: "existing-1", normalizedPhone: "+919800000099", city: "Mumbai", normalizedName: "totally different clinic" });
    const { tx, businesses, possibleDuplicates } = createCascadeFakeDb({ businesses: [existing] });
    const incoming = normalizeBusinessInput(makeIncoming({ phone: "+91-9800000099", city: "Chennai", externalId: "demo-incoming-1" }));

    const first = await resolveBusiness(tx, incoming, provenance);
    expect(possibleDuplicates).toHaveLength(1);
    expect(businesses.size).toBe(2);

    // A replayed delivery of the exact same provider record (same
    // source+externalId) hits tier 1 this time — the candidate business
    // already exists, so it attaches directly rather than re-running the
    // uncorroborated-phone flagging logic a second time.
    const second = await resolveBusiness(tx, incoming, provenance);
    expect(second.business.id).toBe(first.business.id);
    expect(second.flaggedVia).toBeNull();
    expect(possibleDuplicates).toHaveLength(1);
    expect(businesses.size).toBe(2);
  });
});
