import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { ConflictError, InvalidCampaignTransitionError } from "../errors";
import { createCampaign, markCampaignReady, prepareCampaignRun } from "./campaign.service";
import { runCampaign } from "./run.service";
import type { CampaignCreateInput } from "../validation/campaign";
import { DemoProvider, type LeadProvider, type CampaignSearchInput } from "../providers/demo-provider";
import type { BusinessProviderInput } from "../validation/business";
import type { Prisma } from "@pitchmyweb/db";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  // The real-DemoProvider tests above only ever upsert the same stable,
  // fixed "campaign-demo-*" fixture rows (safe to accumulate across runs —
  // same behavior as the seed script). The normalization test injects a
  // one-off custom provider result under its own externalId, which is
  // genuinely test-specific and would otherwise grow unbounded on repeated
  // runs, so it gets cleaned up explicitly (same pattern as
  // lib/leads/lead.service.test.ts / app/api/leads/leads.route.test.ts).
  await prisma.business.deleteMany({ where: { source: "demo", externalId: "normalization-check" } });
  await prisma.$disconnect();
});

async function newReadyCampaign(prefix: string, overrides: Partial<CampaignCreateInput> = {}) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, {
    name: "Run Test",
    location: "Chennai",
    category: "Dental Clinic",
    websiteRequirement: "ANY",
    leadLimit: 10,
    ...overrides,
  });
  await markCampaignReady(prisma, user.id, campaign.id);
  return { user, campaign };
}

describe("runCampaign (real DemoProvider + real DB)", () => {
  it("ingests matching DemoProvider businesses as leads and records LEAD_CREATED", async () => {
    const { user, campaign } = await newReadyCampaign("run-basic");

    const { campaign: finalCampaign, execution } = await runCampaign(prisma, user.id, campaign.id);

    expect(finalCampaign.status).toBe("COMPLETED");
    expect(execution.status).toBe("COMPLETED");
    expect(execution.businessesFound).toBeGreaterThan(0);
    expect(execution.leadsCreated).toBe(execution.businessesFound);
    expect(execution.failedCount).toBe(0);
    expect(execution.failedBusinesses).toBeNull();

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, include: { activities: true } });
    expect(leads.length).toBe(execution.leadsCreated);
    for (const lead of leads) {
      expect(lead.activities.some((a) => a.type === "LEAD_CREATED")).toBe(true);
    }
  });

  it("respects the campaign's category filter (only matching DemoProvider businesses become leads)", async () => {
    // Golden Wok Kitchen (the only Restaurant fixture) is in Bengaluru —
    // location must match too now that the execution path applies it.
    const { user, campaign } = await newReadyCampaign("run-category", { category: "Restaurant", location: "Bengaluru", leadLimit: 50 });
    const { execution } = await runCampaign(prisma, user.id, campaign.id);

    expect(execution.leadsCreated).toBeGreaterThan(0);
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, include: { business: true } });
    expect(leads.length).toBe(execution.leadsCreated);
    for (const lead of leads) {
      expect(lead.business.category.toLowerCase()).toContain("restaurant");
    }
  });

  it("respects location (only businesses whose city/address matches the campaign's location become leads)", async () => {
    // "e" substring-matches most demo categories; Chennai narrows the real
    // DemoProvider fixtures to exactly Coastal Smiles Dental (Dental
    // Clinic) and Little Oven Bakery (Bakery) — both in Chennai, both
    // categories contain "e".
    const { user, campaign } = await newReadyCampaign("run-location", { category: "e", location: "Chennai", leadLimit: 50 });
    const { execution } = await runCampaign(prisma, user.id, campaign.id);

    expect(execution.businessesFound).toBe(2);
    expect(execution.leadsCreated).toBe(2);
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, include: { business: true } });
    for (const lead of leads) {
      expect(lead.business.city).toBe("Chennai");
    }
  });

  it("respects leadLimit strictly: caps created leads even when more eligible businesses exist", async () => {
    // Same Chennai+"e" scenario as above (2 eligible), but leadLimit=1: the
    // execution must create exactly 1 lead, never 2, even though the
    // provider legitimately found and returned both.
    const { user, campaign } = await newReadyCampaign("run-limit", { category: "e", location: "Chennai", leadLimit: 1 });
    const { execution } = await runCampaign(prisma, user.id, campaign.id);

    expect(execution.businessesFound).toBe(2); // the provider still found both
    expect(execution.leadsCreated).toBe(1); // but only one was turned into a lead

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(1);
  });

  it("rejects running a campaign that is not in an allowed pre-run state", async () => {
    const { user, campaign } = await newReadyCampaign("run-twice");
    await runCampaign(prisma, user.id, campaign.id); // -> COMPLETED
    await expect(runCampaign(prisma, user.id, campaign.id)).rejects.toThrow(InvalidCampaignTransitionError);
  });

  it("idempotencyKey replay returns the original execution without creating duplicate leads or executions", async () => {
    const { user, campaign } = await newReadyCampaign("run-idempotent", { category: "Restaurant", location: "Bengaluru" });

    const first = await runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "retry-key-1" });
    const second = await runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "retry-key-1" });

    expect(second.execution.id).toBe(first.execution.id);

    const executions = await prisma.campaignExecution.findMany({ where: { campaignId: campaign.id } });
    expect(executions).toHaveLength(1);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(first.execution.leadsCreated);
  });

  it("a different idempotencyKey after completion is rejected (not a silent second run)", async () => {
    const { user, campaign } = await newReadyCampaign("run-idempotent-diff", { category: "Restaurant", location: "Bengaluru" });
    await runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "key-a" });
    await expect(runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "key-b" })).rejects.toThrow(InvalidCampaignTransitionError);
  });

  it("re-running the same DemoProvider businesses under a second campaign does not duplicate the canonical Business row", async () => {
    const { user: userA, campaign: campaignA } = await newReadyCampaign("run-dedupe-a", { category: "Restaurant", location: "Bengaluru" });
    const { user: userB, campaign: campaignB } = await newReadyCampaign("run-dedupe-b", { category: "Restaurant", location: "Bengaluru" });

    await runCampaign(prisma, userA.id, campaignA.id);
    await runCampaign(prisma, userB.id, campaignB.id);

    const businesses = await prisma.business.findMany({ where: { source: "demo", externalId: { startsWith: "campaign-demo-" } } });
    const externalIds = businesses.map((b) => b.externalId);
    const uniqueExternalIds = new Set(externalIds);
    expect(externalIds.length).toBe(uniqueExternalIds.size); // no duplicate (source, externalId) rows
  });

  // Phase 4 code-review finding #13 fix.
  it("replaying an idempotencyKey while the matching execution is still RUNNING returns 409, not a stale zero-count snapshot", async () => {
    const { user, campaign } = await newReadyCampaign("run-idempotent-inflight");
    // Simulates "another request already claimed this run and is still
    // working" without needing genuine concurrency: manually insert the
    // RUNNING execution row a real in-flight runCampaign call would have
    // created at this point.
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PROCESSING" } });
    await prisma.campaignExecution.create({ data: { campaignId: campaign.id, idempotencyKey: "inflight-key", status: "RUNNING" } });

    await expect(runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "inflight-key" })).rejects.toThrow(ConflictError);
  });

  // Phase 4 code-review finding #14 fix: the "loser" of a concurrent-start
  // race checks once more for a matching execution before giving up.
  it("when prepareCampaignRun loses the race, a completed execution under the same idempotencyKey is still replayed instead of throwing", async () => {
    const { user, campaign } = await newReadyCampaign("run-idempotent-race");
    // Put the campaign into RUNNING directly (as if a concurrent request's
    // prepareCampaignRun already won), then record a COMPLETED execution
    // under the key a "concurrent" caller would retry with.
    await prepareCampaignRun(prisma, user.id, campaign.id);
    const winnerExecution = await prisma.campaignExecution.create({
      data: { campaignId: campaign.id, idempotencyKey: "race-key", status: "COMPLETED", businessesFound: 3, leadsCreated: 3, completedAt: new Date() },
    });

    const result = await runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "race-key" });
    expect(result.execution.id).toBe(winnerExecution.id);
    expect(result.execution.status).toBe("COMPLETED");
  });

  // Section 17: minimum rating boundary. Coastal Smiles Dental (Dental
  // Clinic, Chennai) has rating exactly 4.7 in the real DemoProvider
  // fixtures.
  it("respects minRating as an inclusive floor (boundary test)", async () => {
    const { user: userAt, campaign: campaignAt } = await newReadyCampaign("run-rating-at", { minRating: 4.7 });
    const atBoundary = await runCampaign(prisma, userAt.id, campaignAt.id);
    expect(atBoundary.execution.leadsCreated).toBe(1); // 4.7 >= 4.7: included

    const { user: userAbove, campaign: campaignAbove } = await newReadyCampaign("run-rating-above", { minRating: 4.71 });
    const aboveBoundary = await runCampaign(prisma, userAbove.id, campaignAbove.id);
    expect(aboveBoundary.execution.leadsCreated).toBe(0); // 4.7 < 4.71: excluded
  });

  // Section 18: minimum review boundary. Coastal Smiles Dental has
  // reviewCount exactly 180.
  it("respects minReviews as an inclusive floor (boundary test)", async () => {
    const { user: userAt, campaign: campaignAt } = await newReadyCampaign("run-reviews-at", { minReviews: 180 });
    const atBoundary = await runCampaign(prisma, userAt.id, campaignAt.id);
    expect(atBoundary.execution.leadsCreated).toBe(1); // 180 >= 180: included

    const { user: userAbove, campaign: campaignAbove } = await newReadyCampaign("run-reviews-above", { minReviews: 181 });
    const aboveBoundary = await runCampaign(prisma, userAbove.id, campaignAbove.id);
    expect(aboveBoundary.execution.leadsCreated).toBe(0); // 180 < 181: excluded
  });

  // Section 9/16: website requirement semantics — ANY/WITH_WEBSITE/
  // WITHOUT_WEBSITE, presence-only (no "poor website" concept exists in
  // the Business record — see campaign-filters.ts).
  it("respects websiteRequirement: WITH_WEBSITE only matches businesses with a website on file", async () => {
    // Golden Wok Kitchen (Restaurant, Bengaluru) has a website.
    const { user, campaign } = await newReadyCampaign("run-website-with", { category: "Restaurant", location: "Bengaluru", websiteRequirement: "WITH_WEBSITE" });
    const result = await runCampaign(prisma, user.id, campaign.id);
    expect(result.execution.leadsCreated).toBe(1);

    const { user: userNone, campaign: campaignNone } = await newReadyCampaign("run-website-with-excludes", {
      category: "Auto Repair",
      location: "Pune",
      websiteRequirement: "WITH_WEBSITE",
    });
    const excluded = await runCampaign(prisma, userNone.id, campaignNone.id);
    expect(excluded.execution.leadsCreated).toBe(0); // Torque Auto Garage has no website
  });

  it("respects websiteRequirement: WITHOUT_WEBSITE only matches businesses with no website on file", async () => {
    // Torque Auto Garage (Auto Repair, Pune) has no website.
    const { user, campaign } = await newReadyCampaign("run-website-without", { category: "Auto Repair", location: "Pune", websiteRequirement: "WITHOUT_WEBSITE" });
    const result = await runCampaign(prisma, user.id, campaign.id);
    expect(result.execution.leadsCreated).toBe(1);

    const { user: userWith, campaign: campaignWith } = await newReadyCampaign("run-website-without-excludes", {
      category: "Restaurant",
      location: "Bengaluru",
      websiteRequirement: "WITHOUT_WEBSITE",
    });
    const excluded = await runCampaign(prisma, userWith.id, campaignWith.id);
    expect(excluded.execution.leadsCreated).toBe(0); // Golden Wok Kitchen has a website
  });

  // Section 9: `radius` is documented in campaign-filters.ts as a no-op in
  // V1 (no campaign coordinate, no geocoding) — this characterizes that
  // documented limitation with a test rather than leaving it unverified: a
  // tiny radius must not unexpectedly exclude an otherwise-matching
  // business.
  it("does not filter on radius (documented V1 limitation: no geocoding capability)", async () => {
    const { user, campaign } = await newReadyCampaign("run-radius-noop", { radius: 1 });
    const result = await runCampaign(prisma, user.id, campaign.id);
    expect(result.execution.leadsCreated).toBe(1); // Coastal Smiles Dental still matches despite radius: 1
  });

  // Section 15/checklist item 10-11: a single provider result containing
  // the same business twice (same source+externalId) must not create two
  // Business rows or two Leads, and must not double-count leadsCreated.
  it("a repeated provider result for the same business only creates one Business and one Lead", async () => {
    const { user, campaign } = await newReadyCampaign("run-repeated-result", { leadLimit: 50 });
    const [dental] = await fetchRealDentalFixture();
    const provider: LeadProvider = {
      async search() {
        return [dental, { ...dental }]; // same externalId returned twice in one result
      },
    };

    const result = await runCampaign(prisma, user.id, campaign.id, { provider });

    expect(result.execution.businessesFound).toBe(2);
    expect(result.execution.leadsCreated).toBe(1); // the second occurrence found the existing lead, not a new one
    expect(result.execution.failedCount).toBe(0);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(1);
    const businesses = await prisma.business.findMany({ where: { source: "demo", externalId: "campaign-demo-001" } });
    expect(businesses).toHaveLength(1);
  });

  // Section 11/checklist item 12: retrying an execution that had partial
  // failures must replay the exact same result, not re-attempt the
  // failed business or create additional leads/activities.
  it("retrying (same idempotencyKey) after partial success does not re-attempt the failed business or create duplicates", async () => {
    const { user, campaign } = await newReadyCampaign("run-retry-partial", { leadLimit: 50 });
    const [dental] = await fetchRealDentalFixture();
    const broken: BusinessProviderInput = { ...dental, name: "Broken Business", externalId: "broken-website-url", website: "not-a-valid-url" };
    const provider: LeadProvider = {
      async search() {
        return [dental, broken];
      },
    };

    const first = await runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "partial-retry-key", provider });
    expect(first.execution.leadsCreated).toBe(1);
    expect(first.execution.failedCount).toBe(1);
    expect(first.execution.status).toBe("COMPLETED");

    const second = await runCampaign(prisma, user.id, campaign.id, { idempotencyKey: "partial-retry-key", provider });
    expect(second.execution.id).toBe(first.execution.id);
    expect(second.execution.leadsCreated).toBe(1);
    expect(second.execution.failedCount).toBe(1);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(1); // not re-attempted, no duplicate lead

    const activities = await prisma.activity.findMany({ where: { lead: { campaignId: campaign.id } } });
    expect(activities.filter((a) => a.type === "LEAD_CREATED")).toHaveLength(1); // no duplicate activity either
  });

  // Section 3/6: normalization must run for every business the execution
  // path ingests, not just when called directly through
  // lib/leads/lead.service.test.ts's own unit tests.
  it("normalizes provider results as part of campaign execution (trims/collapses whitespace)", async () => {
    const { user, campaign } = await newReadyCampaign("run-normalization", { category: "Messy", location: "Testville" });
    const provider: LeadProvider = {
      async search() {
        return [
          {
            name: "  Messy   Business  ",
            category: "  Messy  ",
            address: null,
            city: "  Testville  ",
            phone: null,
            email: "  MESSY@Example.com ",
            website: null,
            instagram: null,
            facebook: null,
            rating: null,
            reviewCount: null,
            latitude: null,
            longitude: null,
            source: "demo",
            externalId: "normalization-check",
          },
        ];
      },
    };

    await runCampaign(prisma, user.id, campaign.id, { provider });

    const business = await prisma.business.findUnique({ where: { source_externalId: { source: "demo", externalId: "normalization-check" } } });
    expect(business?.name).toBe("Messy Business");
    expect(business?.category).toBe("Messy");
    expect(business?.city).toBe("Testville");
    expect(business?.email).toBe("messy@example.com");
  });
});

// Fetches the real "Coastal Smiles Dental" fixture from the actual
// DemoProvider rather than hand-duplicating its fields — stays in sync
// automatically if the fixture list ever changes.
async function fetchRealDentalFixture(): Promise<BusinessProviderInput[]> {
  return new DemoProvider().search({ category: "Dental Clinic", location: "Chennai", websiteRequirement: "ANY", leadLimit: 50 });
}

// Per-business failure isolation and total-failure behavior (section 8/40)
// are deterministically forced with a minimal fake Prisma client rather
// than the real DB — there is no reliable way to make a specific business
// fail against a real, healthy database. Phase 4 code-review finding #17:
// this fake used to hardcode DemoProvider's literal fixture content
// ("Golden Wok Kitchen") as the failure trigger; runCampaign now accepts an
// injected `provider` (finding #7's DI fix), so these tests supply their
// own small, fully self-contained LeadProvider instead of depending on a
// different module's fixture data.
function createFakeRunDb(campaignId: string) {
  const businesses = new Map<string, Record<string, unknown>>();
  const leads: Array<Record<string, unknown>> = [];
  const activities: Array<Record<string, unknown>> = [];
  let campaign: Record<string, unknown> = {
    id: campaignId,
    userId: "user-1",
    status: "READY",
    location: "Chennai",
    category: "Test",
    radius: null,
    minRating: null,
    minReviews: null,
    websiteRequirement: "ANY",
    // leadLimit is the search budget, targetCount the delivery promise —
    // ingestBusinesses stops at targetCount pitchable leads and uses
    // leadLimit only to bound how many candidates it looks at.
    leadLimit: 50,
    targetCount: 50,
  };
  let executionSeq = 0;
  const executions = new Map<string, Record<string, unknown>>();
  let leadSeq = 0;
  let businessSeq = 0;

  const client = {
    campaign: {
      findUnique: async () => ({ ...campaign }),
      updateMany: async ({ where, data }: { where: { status: { in: string[] } }; data: Record<string, unknown> }) => {
        if (!where.status.in.includes(campaign.status as string)) return { count: 0 };
        campaign = { ...campaign, ...data };
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        campaign = { ...campaign, ...data };
        return { ...campaign };
      },
    },
    campaignExecution: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        executionSeq += 1;
        const execution = {
          id: `execution-${executionSeq}`,
          startedAt: new Date(),
          completedAt: null,
          businessesFound: 0,
          leadsCreated: 0,
          failedCount: 0,
          failedBusinesses: null,
          errorMessage: null,
          ...data,
        };
        executions.set(execution.id, execution);
        return execution;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = executions.get(where.id);
        const updated = { ...existing, ...data };
        executions.set(where.id, updated);
        return updated;
      },
    },
    business: {
      // Phase 2 dedup cascade's Tier 1 own-existence check — reuses the same
      // source::externalId keying as upsert below, just without the
      // "fails-on-purpose" throw (that's upsert's job, matching the
      // original fixture's intent: the simulated failure happens on the
      // *write*, not the read).
      findUnique: async ({ where }: { where: { source_externalId: { source: string; externalId: string } } }) => {
        const key = `${where.source_externalId.source}::${where.source_externalId.externalId}`;
        return businesses.get(key) ?? null;
      },
      // Tiers 2-4's phone/domain/name+city lookups — this fixture isn't
      // exercising cross-business dedup collisions, only per-business
      // failure isolation, so no match is ever found here.
      findFirst: async () => null,
      upsert: async ({ where, create }: { where: { source_externalId: { source: string; externalId: string } }; create: Record<string, unknown> }) => {
        if (where.source_externalId.externalId === "fails-on-purpose") {
          throw new Error("Simulated failure ingesting this business");
        }
        const key = `${where.source_externalId.source}::${where.source_externalId.externalId}`;
        const existing = businesses.get(key);
        if (existing) return existing;
        businessSeq += 1;
        const business = { id: `business-${businessSeq}`, ...create };
        businesses.set(key, business);
        return business;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        businessSeq += 1;
        const business = { id: `business-${businessSeq}`, ...data };
        return business;
      },
    },
    businessSource: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "business-source-fake", ...data }),
      upsert: async ({ create }: { create: Record<string, unknown> }) => ({ id: "business-source-fake", ...create }),
    },
    possibleDuplicate: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "possible-duplicate-fake", ...data }),
    },
    settings: {
      findUnique: async () => null,
    },
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
    lead: {
      findUnique: async ({ where }: { where: { campaignId_businessId: { campaignId: string; businessId: string } } }) =>
        leads.find((l) => l.campaignId === where.campaignId_businessId.campaignId && l.businessId === where.campaignId_businessId.businessId) ?? null,
      // Two callers, distinguished by what they select: repeat-lead
      // protection asks for this user's leads in *other* campaigns (none
      // here — the fake models a single campaign), and the pitchable count
      // asks for this campaign's leads with their business phone.
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
        if (where.campaignId && typeof where.campaignId === "string") {
          return leads
            .filter((l) => l.campaignId === where.campaignId)
            .map((l) => (select?.business ? { business: { phone: (businesses.get(l.businessId as string)?.phone as string | null) ?? null } } : l));
        }
        return [];
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = leads.findIndex((l) => l.id === where.id);
        return index === -1 ? null : leads.splice(index, 1)[0];
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        leadSeq += 1;
        const lead = { id: `lead-${leadSeq}`, status: "NEW", ...data };
        leads.push(lead);
        return lead;
      },
    },
    activity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const activity = { id: `activity-${activities.length + 1}`, createdAt: new Date(), ...data };
        activities.push(activity);
        return activity;
      },
    },
    // Supports both the callback form (used internally by
    // ingestBusinessAsLead) and the array form (used by run.service.ts's
    // own two transactional checkpoints, Phase 4 finding #3/#4 fix) — a
    // real Prisma client accepts both; this fake now mirrors that.
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) {
        const results = [];
        for (const p of arg) results.push(await p);
        return results;
      }
      return (arg as (tx: unknown) => Promise<unknown>)(client);
    },
  };

  return {
    db: client as unknown as Prisma.TransactionClient & typeof client,
    getLeads: () => leads,
    getActivities: () => activities,
    getCampaign: () => campaign,
    getExecutions: () => [...executions.values()],
    getBusinesses: () => [...businesses.values()],
  };
}

// Small, self-contained provider fixtures — not coupled to
// lib/providers/demo-provider.ts's real fixture list.
function makeProvider(businesses: BusinessProviderInput[]): LeadProvider {
  return {
    async search(_input: CampaignSearchInput): Promise<BusinessProviderInput[]> {
      return businesses;
    },
  };
}

// city matches createFakeRunDb's fake campaign location ("Chennai") so
// these fixtures pass the run.service.ts defense-in-depth location filter,
// same as every other campaign filter it's meant to satisfy.
const okBusiness = (n: number): BusinessProviderInput => ({
  name: `OK Business ${n}`,
  category: "Test",
  address: null,
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
  source: "test",
  externalId: `ok-${n}`,
});

const failingBusiness: BusinessProviderInput = {
  ...okBusiness(0),
  name: "Business That Fails To Ingest",
  externalId: "fails-on-purpose",
};

describe("runCampaign per-business failure isolation (fake DB)", () => {
  it("one failing business does not roll back the others and does not fail the campaign, and records structured failure detail", async () => {
    const { db, getLeads, getActivities, getCampaign, getExecutions } = createFakeRunDb("campaign-1");
    const provider = makeProvider([okBusiness(1), failingBusiness, okBusiness(2)]);

    const result = await runCampaign(db as never, "user-1", "campaign-1", { provider });

    expect(result.execution.status).toBe("COMPLETED"); // partial failure still completes the campaign (section 40)
    expect(result.execution.failedCount).toBe(1);
    expect(result.execution.leadsCreated).toBe(2);
    expect(getCampaign().status).toBe("COMPLETED");

    // Phase 4 code-review finding #6 fix: structured per-business failure
    // detail, not just a count.
    expect(result.execution.failedBusinesses).toEqual([{ name: failingBusiness.name, externalId: "fails-on-purpose", error: "Simulated failure ingesting this business" }]);

    expect(getLeads().length).toBe(result.execution.leadsCreated);

    const leadCreatedActivities = getActivities().filter((a) => a.type === "LEAD_CREATED");
    expect(leadCreatedActivities.length).toBe(result.execution.leadsCreated);

    expect(getExecutions()).toHaveLength(1);
  });

  // Phase 4 code-review finding #5 fix.
  it("marks the campaign FAILED, not COMPLETED, when every discovered business fails to ingest", async () => {
    const { db, getCampaign } = createFakeRunDb("campaign-2");
    // Both fixtures share the "fails-on-purpose" externalId marker the fake
    // db is configured to reject, so every discovered business fails.
    const allFailProvider = makeProvider([{ ...failingBusiness }, { ...failingBusiness, name: "Also Fails" }]);

    const result = await runCampaign(db as never, "user-1", "campaign-2", { provider: allFailProvider });

    expect(result.execution.businessesFound).toBe(2);
    expect(result.execution.failedCount).toBe(2);
    expect(result.execution.leadsCreated).toBe(0);
    expect(result.execution.status).toBe("FAILED");
    expect(result.execution.errorMessage).toBe("All 2 attempted businesses failed to ingest.");
    expect(getCampaign().status).toBe("FAILED");
  });

  it("stays COMPLETED when the provider legitimately finds zero businesses (not a failure)", async () => {
    const { db, getCampaign } = createFakeRunDb("campaign-3");
    const result = await runCampaign(db as never, "user-1", "campaign-3", { provider: makeProvider([]) });

    expect(result.execution.businessesFound).toBe(0);
    expect(result.execution.failedCount).toBe(0);
    expect(result.execution.status).toBe("COMPLETED");
    expect(getCampaign().status).toBe("COMPLETED");
  });

  // Section 8 defense-in-depth: the execution service must not assume a
  // provider filtered correctly. This provider deliberately returns
  // businesses that do NOT satisfy the fake campaign's filters (category
  // "Test", location "Chennai") alongside ones that do.
  it("re-filters provider results against the campaign's own filters, ignoring businesses a (misbehaving) provider returns anyway", async () => {
    const { db, getLeads } = createFakeRunDb("campaign-5");
    const wrongCategory: BusinessProviderInput = { ...okBusiness(1), name: "Wrong Category", category: "Totally Different", externalId: "wrong-category" };
    const wrongLocation: BusinessProviderInput = { ...okBusiness(2), name: "Wrong Location", city: "Nowhere", externalId: "wrong-location" };
    const eligible = okBusiness(3);
    const overPermissiveProvider = makeProvider([wrongCategory, wrongLocation, eligible]);

    const result = await runCampaign(db as never, "user-1", "campaign-5", { provider: overPermissiveProvider });

    // businessesFound reflects the provider's raw (over-permissive) return
    // value; leadsCreated reflects only what actually passed the campaign's
    // own filters — proving the second, independent filter pass ran.
    expect(result.execution.businessesFound).toBe(3);
    expect(result.execution.leadsCreated).toBe(1);
    expect(result.execution.failedCount).toBe(0); // filtered out, not a failure
    expect(getLeads()).toHaveLength(1);
  });

  // Section 6: a malformed individual business must not crash the whole
  // execution. This provider returns one structurally invalid record
  // (fails businessProviderInputSchema — missing required `category`)
  // sandwiched between two valid ones.
  it("isolates a structurally malformed business (fails Zod validation) instead of crashing the whole run", async () => {
    const { db, getLeads } = createFakeRunDb("campaign-6");
    const malformed = { ...okBusiness(10), category: undefined, externalId: "malformed" } as unknown as BusinessProviderInput;
    const provider = makeProvider([okBusiness(11), malformed, okBusiness(12)]);

    const result = await runCampaign(db as never, "user-1", "campaign-6", { provider });

    expect(result.execution.status).toBe("COMPLETED");
    expect(result.execution.businessesFound).toBe(3);
    expect(result.execution.leadsCreated).toBe(2);
    expect(result.execution.failedCount).toBe(1);
    expect(result.execution.failedBusinesses).toHaveLength(1);
    expect((result.execution.failedBusinesses as Array<{ externalId: string }>)[0]?.externalId).toBe("malformed");
    expect(getLeads()).toHaveLength(2);
  });

  // Phase 4 code-review finding #8 fix.
  it("never returns a provider's raw error message in the response; only a fixed, generic message", async () => {
    const { db, getCampaign } = createFakeRunDb("campaign-4");
    const sensitiveProvider: LeadProvider = {
      async search() {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432 using apikey=sk-live-secret-12345");
      },
    };

    const result = await runCampaign(db as never, "user-1", "campaign-4", { provider: sensitiveProvider });

    expect(result.execution.status).toBe("FAILED");
    expect(result.execution.errorMessage).toBe("Business discovery failed. See server logs for details.");
    expect(result.execution.errorMessage).not.toContain("sk-live-secret");
    expect(result.execution.errorMessage).not.toContain("10.0.0.5");
    expect(getCampaign().status).toBe("FAILED");
  });
});
