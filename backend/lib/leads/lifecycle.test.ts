import { describe, expect, it } from "vitest";
import type { LeadStatus, PrismaClient } from "../../generated/prisma/client";
import { InvalidLeadTransitionError, NotFoundError } from "../errors";
import { isLeadTransitionAllowed, transitionLeadStatus } from "./lifecycle";

// Minimal in-memory fake standing in for PrismaClient: only the lead/
// activity operations transitionLeadStatus actually calls. $transaction
// just invokes the callback with the same fake, mirroring how Prisma's
// interactive transactions hand the callback a client bound to one
// connection — sufficient to prove "no mutation on rejection" without a
// live database (full Postgres integration tests are a later phase per
// backend_tasks.md section 43, Phase 7).
function createFakeDb(initialStatus: LeadStatus, options: { campaignId?: string; ownerUserId?: string } = {}) {
  const campaignId = options.campaignId ?? "campaign-1";
  const ownerUserId = options.ownerUserId ?? "user-1";
  let lead: { id: string; status: LeadStatus; campaignId: string; estimatedDealMin: number | null; estimatedDealMax: number | null } | null = {
    id: "lead-1",
    status: initialStatus,
    campaignId,
    estimatedDealMin: null,
    estimatedDealMax: null,
  };
  const activities: Array<{ leadId: string; type: string; metadata?: unknown }> = [];
  const deals = new Map<string, { leadId: string; value: number; status: string }>();

  const client = {
    lead: {
      findUnique: async ({ where }: { where: { id: string } }) => (lead && lead.id === where.id ? { ...lead } : null),
      update: async ({ where, data }: { where: { id: string }; data: Partial<{ status: LeadStatus }> }) => {
        if (!lead || lead.id !== where.id) throw new Error("not found");
        lead = { ...lead, ...data };
        return { ...lead };
      },
    },
    // Only used by the expectedOwnerUserId check (Phase 4 code-review
    // finding #10) — a single fixed campaign row owned by ownerUserId.
    campaign: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === campaignId ? { id: campaignId, userId: ownerUserId } : null),
    },
    activity: {
      create: async ({ data }: { data: { leadId: string; type: string; metadata?: unknown } }) => {
        activities.push(data);
        return { id: `activity-${activities.length}`, createdAt: new Date(), ...data };
      },
    },
    deal: {
      upsert: async ({ where, create, update }: { where: { leadId: string }; create: { leadId: string; value: number; status: string }; update: { status: string } }) => {
        const existing = deals.get(where.leadId);
        const row = existing ? { ...existing, ...update } : { ...create };
        deals.set(where.leadId, row);
        return row;
      },
      updateMany: async ({ where, data }: { where: { leadId: string }; data: { status: string } }) => {
        const existing = deals.get(where.leadId);
        if (!existing) return { count: 0 };
        deals.set(where.leadId, { ...existing, ...data });
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };

  return {
    db: client as unknown as PrismaClient,
    getStatus: () => lead?.status,
    getActivities: () => activities,
    getDeal: () => deals.get("lead-1"),
  };
}

describe("isLeadTransitionAllowed", () => {
  it("allows every documented step of the happy path", () => {
    const steps: Array<[LeadStatus, LeadStatus]> = [
      ["NEW", "ANALYZED"],
      ["ANALYZED", "SITE_READY"],
      ["SITE_READY", "PITCHED"],
      ["PITCHED", "REPLIED"],
      ["REPLIED", "INTERESTED"],
      ["INTERESTED", "NEGOTIATING"],
      ["NEGOTIATING", "WON"],
    ];
    for (const [from, to] of steps) {
      expect(isLeadTransitionAllowed(from, to)).toBe(true);
    }
  });

  it("allows LOST from every active stage", () => {
    const activeStages: LeadStatus[] = ["NEW", "ANALYZED", "SITE_READY", "PITCHED", "REPLIED", "INTERESTED", "NEGOTIATING"];
    for (const stage of activeStages) {
      expect(isLeadTransitionAllowed(stage, "LOST")).toBe(true);
    }
  });

  it("rejects the documented illegal examples", () => {
    expect(isLeadTransitionAllowed("NEW", "WON")).toBe(false);
    expect(isLeadTransitionAllowed("NEW", "PITCHED")).toBe(false);
    expect(isLeadTransitionAllowed("WON", "NEW")).toBe(false);
  });

  it("treats WON and LOST as terminal", () => {
    expect(isLeadTransitionAllowed("WON", "LOST")).toBe(false);
    expect(isLeadTransitionAllowed("LOST", "NEW")).toBe(false);
    expect(isLeadTransitionAllowed("LOST", "WON")).toBe(false);
  });
});

describe("transitionLeadStatus - valid transitions", () => {
  it("updates status and records the mapped activity", async () => {
    const { db, getStatus, getActivities } = createFakeDb("NEW");
    const result = await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "ANALYZED" });
    expect(result.status).toBe("ANALYZED");
    expect(getStatus()).toBe("ANALYZED");
    expect(getActivities()).toEqual([{ leadId: "lead-1", type: "LEAD_ANALYZED", metadata: undefined }]);
  });

  it("maps SITE_READY to WEBSITE_GENERATED (documented assumption)", async () => {
    const { db, getActivities } = createFakeDb("ANALYZED");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "SITE_READY" });
    expect(getActivities()[0]?.type).toBe("WEBSITE_GENERATED");
  });

  it("maps NEGOTIATING to MEETING (documented assumption)", async () => {
    const { db, getActivities } = createFakeDb("INTERESTED");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "NEGOTIATING" });
    expect(getActivities()[0]?.type).toBe("MEETING");
  });

  it("records LOST from an active stage", async () => {
    const { db, getStatus, getActivities } = createFakeDb("PITCHED");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "LOST" });
    expect(getStatus()).toBe("LOST");
    expect(getActivities()[0]?.type).toBe("LOST");
  });

  it("walks the full documented happy path with one activity per step", async () => {
    const { db, getStatus, getActivities } = createFakeDb("NEW");
    const path: LeadStatus[] = ["ANALYZED", "SITE_READY", "PITCHED", "REPLIED", "INTERESTED", "NEGOTIATING", "WON"];
    for (const nextStatus of path) {
      await transitionLeadStatus(db, { leadId: "lead-1", nextStatus });
    }
    expect(getStatus()).toBe("WON");
    expect(getActivities()).toHaveLength(path.length);
  });
});

// Phase 8 section 2/3: Deal sync is a derived side effect of an
// already-authoritative Lead transition, never a second source of truth.
describe("transitionLeadStatus - Deal sync (Phase 8)", () => {
  it("creates a Deal seeded from estimatedDealMax on first NEGOTIATING transition", async () => {
    const { db, getDeal } = createFakeDb("INTERESTED");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "NEGOTIATING" });
    expect(getDeal()).toEqual({ leadId: "lead-1", value: 0, status: "NEGOTIATING" });
  });

  it("updates an existing Deal's status to WON without resetting its value", async () => {
    const { db, getDeal } = createFakeDb("INTERESTED");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "NEGOTIATING" });
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "WON" });
    expect(getDeal()).toEqual({ leadId: "lead-1", value: 0, status: "WON" });
  });

  it("never creates a Deal for a lead lost before reaching NEGOTIATING", async () => {
    const { db, getDeal } = createFakeDb("PITCHED");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "LOST" });
    expect(getDeal()).toBeUndefined();
  });

  it("marks an existing Deal LOST when a negotiating lead is lost, without touching its value", async () => {
    const { db, getDeal } = createFakeDb("INTERESTED");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "NEGOTIATING" });
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "LOST" });
    expect(getDeal()).toEqual({ leadId: "lead-1", value: 0, status: "LOST" });
  });

  it("does not create or touch a Deal for non-commercial transitions", async () => {
    const { db, getDeal } = createFakeDb("NEW");
    await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "ANALYZED" });
    expect(getDeal()).toBeUndefined();
  });
});

describe("transitionLeadStatus - invalid transitions", () => {
  it("rejects NEW -> WON without mutating the lead or creating an activity", async () => {
    const { db, getStatus, getActivities } = createFakeDb("NEW");
    await expect(transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "WON" })).rejects.toThrow(InvalidLeadTransitionError);
    expect(getStatus()).toBe("NEW");
    expect(getActivities()).toHaveLength(0);
  });

  it("rejects NEW -> PITCHED without mutating the lead or creating an activity", async () => {
    const { db, getStatus, getActivities } = createFakeDb("NEW");
    await expect(transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "PITCHED" })).rejects.toThrow(InvalidLeadTransitionError);
    expect(getStatus()).toBe("NEW");
    expect(getActivities()).toHaveLength(0);
  });

  it("rejects WON -> NEW without mutating the lead or creating an activity", async () => {
    const { db, getStatus, getActivities } = createFakeDb("WON");
    await expect(transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "NEW" })).rejects.toThrow(InvalidLeadTransitionError);
    expect(getStatus()).toBe("WON");
    expect(getActivities()).toHaveLength(0);
  });

  it("carries the current and attempted status on the error", async () => {
    const { db } = createFakeDb("NEW");
    const error = await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "WON" }).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidLeadTransitionError);
    expect(error.currentStatus).toBe("NEW");
    expect(error.attemptedStatus).toBe("WON");
    expect(error.httpStatus).toBe(409);
  });

  it("throws NotFoundError for a missing lead without creating an activity", async () => {
    const { db, getActivities } = createFakeDb("NEW");
    await expect(transitionLeadStatus(db, { leadId: "does-not-exist", nextStatus: "ANALYZED" })).rejects.toThrow(NotFoundError);
    expect(getActivities()).toHaveLength(0);
  });
});

// Phase 4 code-review finding #10: transitionLeadStatus previously had no
// awareness at all of resource ownership. expectedOwnerUserId is the
// optional defense-in-depth check added to close that gap.
describe("transitionLeadStatus - expectedOwnerUserId (Phase 4 finding #10)", () => {
  it("succeeds when expectedOwnerUserId matches the lead's campaign owner", async () => {
    const { db, getStatus } = createFakeDb("NEW", { ownerUserId: "user-1" });
    const result = await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "ANALYZED", expectedOwnerUserId: "user-1" });
    expect(result.status).toBe("ANALYZED");
    expect(getStatus()).toBe("ANALYZED");
  });

  it("rejects with NotFoundError (not a distinct 'forbidden' error) when expectedOwnerUserId does not match, without mutating the lead or creating an activity", async () => {
    const { db, getStatus, getActivities } = createFakeDb("NEW", { ownerUserId: "user-1" });
    await expect(transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "ANALYZED", expectedOwnerUserId: "someone-else" })).rejects.toThrow(NotFoundError);
    expect(getStatus()).toBe("NEW");
    expect(getActivities()).toHaveLength(0);
  });

  it("does not check ownership at all when expectedOwnerUserId is omitted (existing callers like applyLeadAnalysis are unaffected)", async () => {
    const { db, getStatus } = createFakeDb("NEW", { ownerUserId: "user-1" });
    const result = await transitionLeadStatus(db, { leadId: "lead-1", nextStatus: "ANALYZED" });
    expect(result.status).toBe("ANALYZED");
    expect(getStatus()).toBe("ANALYZED");
  });
});
