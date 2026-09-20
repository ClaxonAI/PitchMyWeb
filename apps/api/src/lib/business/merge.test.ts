import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@pitchmyweb/db";
import { dismissPossibleDuplicate, mergeBusinesses } from "./merge";
import { ConflictError, NotFoundError } from "../errors";

type FakeBusiness = { id: string; mergedIntoId: string | null };
type FakeLead = { id: string; campaignId: string; businessId: string };
type FakePossibleDuplicate = {
  id: string;
  businessId: string;
  candidateId: string;
  status: "PENDING" | "CONFIRMED_MERGED" | "DISMISSED";
  resolvedAt: Date | null;
  resolvedBy: string | null;
};

function createFakeDb(seed: { businesses: FakeBusiness[]; leads: FakeLead[]; possibleDuplicates: FakePossibleDuplicate[] }) {
  const businesses = new Map(seed.businesses.map((b) => [b.id, { ...b }]));
  const leads = seed.leads.map((l) => ({ ...l }));
  const possibleDuplicates = new Map(seed.possibleDuplicates.map((p) => [p.id, { ...p }]));
  const merges: Array<{ id: string; winnerBusinessId: string; loserBusinessId: string; resolvedBy: string; reason: string | null; possibleDuplicateId: string | null }> = [];
  let mergeSeq = 0;

  const client = {
    possibleDuplicate: {
      findUnique: async ({ where }: { where: { id: string } }) => possibleDuplicates.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = possibleDuplicates.get(where.id)!;
        const updated = { ...existing, ...data };
        possibleDuplicates.set(where.id, updated);
        return updated;
      },
    },
    lead: {
      findMany: async ({ where }: { where: { businessId: string } }) => leads.filter((l) => l.businessId === where.businessId),
      findUnique: async ({ where }: { where: { campaignId_businessId: { campaignId: string; businessId: string } } }) =>
        leads.find((l) => l.campaignId === where.campaignId_businessId.campaignId && l.businessId === where.campaignId_businessId.businessId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const lead = leads.find((l) => l.id === where.id)!;
        Object.assign(lead, data);
        return lead;
      },
    },
    business: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const business = businesses.get(where.id)!;
        Object.assign(business, data);
        return business;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const business = businesses.get(where.id);
        if (!business) throw new Error(`not found: ${where.id}`);
        return business;
      },
    },
    businessMerge: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mergeSeq += 1;
        const merge = { id: `merge-${mergeSeq}`, ...data } as (typeof merges)[number];
        merges.push(merge);
        return merge;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };

  return { db: client as unknown as PrismaClient, leads, businesses, possibleDuplicates, merges };
}

describe("mergeBusinesses", () => {
  it("reassigns the loser's lead to the winner when there's no campaign collision", async () => {
    const { db, leads, businesses } = createFakeDb({
      businesses: [
        { id: "winner", mergedIntoId: null },
        { id: "loser", mergedIntoId: null },
      ],
      leads: [{ id: "lead-1", campaignId: "campaign-1", businessId: "loser" }],
      possibleDuplicates: [{ id: "pd-1", businessId: "winner", candidateId: "loser", status: "PENDING", resolvedAt: null, resolvedBy: null }],
    });

    const result = await mergeBusinesses(db, { possibleDuplicateId: "pd-1", resolvedBy: "user-1" });

    expect(result.winner.id).toBe("winner");
    expect(result.loser.id).toBe("loser");
    expect(businesses.get("loser")!.mergedIntoId).toBe("winner");
    expect(leads.find((l) => l.id === "lead-1")!.businessId).toBe("winner");
  });

  it("does not orphan or drop the loser's lead when the winner already has a lead in the same campaign", async () => {
    const { db, leads, businesses } = createFakeDb({
      businesses: [
        { id: "winner", mergedIntoId: null },
        { id: "loser", mergedIntoId: null },
      ],
      leads: [
        { id: "lead-winner", campaignId: "campaign-1", businessId: "winner" },
        { id: "lead-loser", campaignId: "campaign-1", businessId: "loser" },
      ],
      possibleDuplicates: [{ id: "pd-1", businessId: "winner", candidateId: "loser", status: "PENDING", resolvedAt: null, resolvedBy: null }],
    });

    await mergeBusinesses(db, { possibleDuplicateId: "pd-1", resolvedBy: "user-1" });

    // The loser's own lead still exists, still pointing at the (now merged-
    // away) loser business — never reassigned onto the winner (which would
    // violate @@unique([campaignId, businessId])) and never deleted.
    const loserLead = leads.find((l) => l.id === "lead-loser")!;
    expect(loserLead.businessId).toBe("loser");
    expect(businesses.get("loser")!.mergedIntoId).toBe("winner");
    expect(leads.find((l) => l.id === "lead-winner")!.businessId).toBe("winner");
  });

  it("throws NotFoundError for an unknown possibleDuplicateId", async () => {
    const { db } = createFakeDb({ businesses: [], leads: [], possibleDuplicates: [] });
    await expect(mergeBusinesses(db, { possibleDuplicateId: "missing", resolvedBy: "user-1" })).rejects.toThrow(NotFoundError);
  });

  it("rejects merging a review that isn't PENDING (double-merge protection)", async () => {
    const { db } = createFakeDb({
      businesses: [
        { id: "winner", mergedIntoId: null },
        { id: "loser", mergedIntoId: "winner" },
      ],
      leads: [],
      possibleDuplicates: [{ id: "pd-1", businessId: "winner", candidateId: "loser", status: "CONFIRMED_MERGED", resolvedAt: new Date(), resolvedBy: "user-1" }],
    });
    await expect(mergeBusinesses(db, { possibleDuplicateId: "pd-1", resolvedBy: "user-2" })).rejects.toThrow(ConflictError);
  });

  it("marks the review CONFIRMED_MERGED with resolvedBy/resolvedAt set", async () => {
    const { db, possibleDuplicates } = createFakeDb({
      businesses: [
        { id: "winner", mergedIntoId: null },
        { id: "loser", mergedIntoId: null },
      ],
      leads: [],
      possibleDuplicates: [{ id: "pd-1", businessId: "winner", candidateId: "loser", status: "PENDING", resolvedAt: null, resolvedBy: null }],
    });

    await mergeBusinesses(db, { possibleDuplicateId: "pd-1", resolvedBy: "user-1", reason: "same phone number" });

    const pd = possibleDuplicates.get("pd-1")!;
    expect(pd.status).toBe("CONFIRMED_MERGED");
    expect(pd.resolvedBy).toBe("user-1");
    expect(pd.resolvedAt).toBeInstanceOf(Date);
  });
});

describe("dismissPossibleDuplicate", () => {
  it("marks a PENDING review DISMISSED", async () => {
    const { db, possibleDuplicates } = createFakeDb({
      businesses: [],
      leads: [],
      possibleDuplicates: [{ id: "pd-1", businessId: "a", candidateId: "b", status: "PENDING", resolvedAt: null, resolvedBy: null }],
    });
    const result = await dismissPossibleDuplicate(db, { possibleDuplicateId: "pd-1", resolvedBy: "user-1" });
    expect(result.status).toBe("DISMISSED");
    expect(possibleDuplicates.get("pd-1")!.status).toBe("DISMISSED");
  });

  it("is idempotent: dismissing an already-dismissed review just returns it, no error", async () => {
    const { db } = createFakeDb({
      businesses: [],
      leads: [],
      possibleDuplicates: [{ id: "pd-1", businessId: "a", candidateId: "b", status: "DISMISSED", resolvedAt: new Date(), resolvedBy: "user-1" }],
    });
    const result = await dismissPossibleDuplicate(db, { possibleDuplicateId: "pd-1", resolvedBy: "user-2" });
    expect(result.status).toBe("DISMISSED");
  });

  it("rejects dismissing a review that has already been merged", async () => {
    const { db } = createFakeDb({
      businesses: [],
      leads: [],
      possibleDuplicates: [{ id: "pd-1", businessId: "a", candidateId: "b", status: "CONFIRMED_MERGED", resolvedAt: new Date(), resolvedBy: "user-1" }],
    });
    await expect(dismissPossibleDuplicate(db, { possibleDuplicateId: "pd-1", resolvedBy: "user-2" })).rejects.toThrow(ConflictError);
  });

  it("throws NotFoundError for an unknown possibleDuplicateId", async () => {
    const { db } = createFakeDb({ businesses: [], leads: [], possibleDuplicates: [] });
    await expect(dismissPossibleDuplicate(db, { possibleDuplicateId: "missing", resolvedBy: "user-1" })).rejects.toThrow(NotFoundError);
  });
});
