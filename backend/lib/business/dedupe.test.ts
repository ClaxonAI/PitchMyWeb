import { describe, expect, it } from "vitest";
import type { Prisma } from "../../generated/prisma/client";
import { normalizeBusinessInput } from "./normalize";
import { upsertCanonicalBusiness } from "./dedupe";
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
