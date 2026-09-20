import { describe, expect, it } from "vitest";
import type { Prisma } from "@pitchmyweb/db";
import { recordBusinessSource } from "./business-source";

function createFakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 1;

  const client = {
    businessSource: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `business-source-${nextId++}`, ...data };
        rows.set(`no-key::${row.id}`, row);
        return row;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { source_sourceBusinessId: { source: string; sourceBusinessId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = `${where.source_sourceBusinessId.source}::${where.source_sourceBusinessId.sourceBusinessId}`;
        const existing = rows.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          rows.set(key, updated);
          return updated;
        }
        const row = { id: `business-source-${nextId++}`, ...create };
        rows.set(key, row);
        return row;
      },
    },
  };

  return { db: client as unknown as Prisma.TransactionClient, size: () => rows.size };
}

describe("recordBusinessSource", () => {
  it("creates an evidence row the first time a provider record is seen", async () => {
    const { db, size } = createFakeDb();
    await recordBusinessSource(db, { businessId: "business-1", source: "demo", sourceBusinessId: "demo-001", sourceUrl: null, rawData: { name: "Lakshmi" } });
    expect(size()).toBe(1);
  });

  it("upserts (not duplicates) when the same (source, sourceBusinessId) is seen again", async () => {
    const { db, size } = createFakeDb();
    await recordBusinessSource(db, { businessId: "business-1", source: "demo", sourceBusinessId: "demo-001", sourceUrl: null, rawData: { rating: 4.5 } });
    await recordBusinessSource(db, { businessId: "business-1", source: "demo", sourceBusinessId: "demo-001", sourceUrl: null, rawData: { rating: 4.8 } });
    expect(size()).toBe(1);
  });

  it("treats a different sourceBusinessId as a distinct evidence row", async () => {
    const { db, size } = createFakeDb();
    await recordBusinessSource(db, { businessId: "business-1", source: "demo", sourceBusinessId: "demo-001", sourceUrl: null, rawData: {} });
    await recordBusinessSource(db, { businessId: "business-1", source: "demo", sourceBusinessId: "demo-002", sourceUrl: null, rawData: {} });
    expect(size()).toBe(2);
  });

  it("always creates a fresh row when sourceBusinessId is null (nothing to deduplicate against)", async () => {
    const { db, size } = createFakeDb();
    await recordBusinessSource(db, { businessId: "business-1", source: "osm", sourceBusinessId: null, sourceUrl: null, rawData: {} });
    await recordBusinessSource(db, { businessId: "business-1", source: "osm", sourceBusinessId: null, sourceUrl: null, rawData: {} });
    expect(size()).toBe(2);
  });
});
