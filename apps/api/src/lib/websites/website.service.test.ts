import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueBusinessName, uniqueIndianPhone } from "../testing/db-test-helpers";
import { createCampaign } from "../campaigns/campaign.service";
import { ingestBusinessAsLead, applyLeadAnalysis } from "../leads/lead.service";
import { transitionLeadStatus } from "../leads/lifecycle";
import { calculateOpportunityScore } from "../scoring/scoring";
import { createWebsiteProject, createNewWebsiteVersion, getWebsiteProjectForUser, listWebsiteProjectsForUser, publishWebsiteProject } from "./website.service";
import { ConflictError, InvalidWebsiteTransitionError, NotFoundError, isUniqueConstraintViolation } from "../errors";
import type { BusinessProviderInput } from "../validation/business";
import type { TemplateContent } from "../validation/website";
import type { Prisma } from "@pitchmyweb/db";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "website-service-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

let providerSeq = 0;
// Phase 2 dedup engine: a fresh unique name per call (not a shared literal)
// so calls in this file don't tier-4-exact-match each other — or, since
// city is also shared here, businesses fixtured the same way in *other*
// test files running concurrently against the same live dev database.
async function newLead(prefix: string, businessName = uniqueBusinessName("Lakshmi Dental Care")) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, { name: "Website Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  providerSeq += 1;
  const providerInput: BusinessProviderInput = {
    name: businessName,
    category: "Dental Clinic",
    address: "12 MG Road",
    city: "Chennai",
    // Phase 2 dedup engine: a shared phone number would legitimately dedup
    // these "different" test businesses (tier 2, corroborated by city) —
    // even across concurrently-running test files.
    phone: uniqueIndianPhone(),
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.5,
    reviewCount: 50,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
  };
  const { lead, business } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  return { user, campaign, lead, business };
}

const content = (overrides: Partial<TemplateContent> = {}): TemplateContent => ({
  template: "clinic-modern",
  businessName: "Lakshmi Dental Care",
  theme: "clean",
  hero: { headline: "Trusted Dental Care", subheadline: "Modern dental care in Chennai.", cta: "Book Appointment" },
  services: ["Dental Implants", "Teeth Cleaning"],
  contact: { phone: "+91-9800000001", address: "Chennai" },
  ...overrides,
});

describe("createWebsiteProject (tests 4, 5)", () => {
  it("creates a WebsiteProject with a unique slug and an initial WebsiteVersion (versionNumber 1)", async () => {
    const { user, lead } = await newLead("create");
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    expect(project.leadId).toBe(lead.id);
    expect(project.status).toBe("DRAFT");
    expect(project.template).toBe("clinic-modern");
    expect(project.slug).toBeTruthy();
    expect(project.slug).toMatch(/^[a-z0-9-]+$/); // URL-safe
    expect(project.demoUrl).toContain(project.slug);

    expect(project.versions).toHaveLength(1);
    expect(project.versions[0]?.versionNumber).toBe(1);
    expect(project.versions[0]?.contentJSON).toMatchObject(content() as unknown as Prisma.JsonObject);
  });

  it("generates a different slug for two projects derived from the same business name (collision-safe)", async () => {
    const { user: userA, lead: leadA } = await newLead("collide-a", "Same Name Clinic");
    const { user: userB, lead: leadB } = await newLead("collide-b", "Same Name Clinic");

    const projectA = await createWebsiteProject(prisma, userA.id, { leadId: leadA.id, contentJSON: content({ businessName: "Same Name Clinic" }) });
    const projectB = await createWebsiteProject(prisma, userB.id, { leadId: leadB.id, contentJSON: content({ businessName: "Same Name Clinic" }) });

    expect(projectA.slug).not.toBe(projectB.slug);
    expect(projectA.slug.startsWith("same-name-clinic")).toBe(true);
    expect(projectB.slug.startsWith("same-name-clinic")).toBe(true);
  });

  it("rejects creating a website for another user's lead, without creating anything (test 3/9)", async () => {
    const { lead } = await newLead("owner-a");
    const other = await createTestUser("owner-b");
    createdUserIds.push(other.id);

    await expect(createWebsiteProject(prisma, other.id, { leadId: lead.id, contentJSON: content() })).rejects.toThrow(NotFoundError);

    const projects = await prisma.websiteProject.findMany({ where: { leadId: lead.id } });
    expect(projects).toHaveLength(0); // Lead untouched, nothing half-created

    const leadRow = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(leadRow?.status).toBe("NEW"); // Lead itself never modified
  });

  it("rejects creating a website for a nonexistent lead", async () => {
    const user = await createTestUser("nonexistent-lead");
    createdUserIds.push(user.id);
    await expect(createWebsiteProject(prisma, user.id, { leadId: "does-not-exist", contentJSON: content() })).rejects.toThrow(NotFoundError);
  });
});

// Phase 8 section 12 ("Activity Integrity"): WEBSITE_GENERATED was defined
// in the schema but never actually created by any code path before this
// phase. These tests verify the two ways createWebsiteProject now records
// it (real lifecycle transition, or a direct Activity when there is no
// forward transition left to make).
describe("createWebsiteProject - WEBSITE_GENERATED activity/lifecycle wiring (Phase 8)", () => {
  it("transitions an ANALYZED lead to SITE_READY and records WEBSITE_GENERATED via the real lifecycle transition", async () => {
    const { user, lead, business } = await newLead("website-generated-analyzed");
    const score = calculateOpportunityScore(business);
    await applyLeadAnalysis(prisma, { leadId: lead.id, score, recommendedService: "WEBSITE", estimatedDealMin: 1000, estimatedDealMax: 2000 });

    await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead?.status).toBe("SITE_READY");

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.filter((a) => a.type === "WEBSITE_GENERATED")).toHaveLength(1);
  });

  it("records WEBSITE_GENERATED directly, without an illegal transition, for a lead already past SITE_READY", async () => {
    const { user, lead, business } = await newLead("website-generated-second-site");
    const score = calculateOpportunityScore(business);
    await applyLeadAnalysis(prisma, { leadId: lead.id, score, recommendedService: "WEBSITE", estimatedDealMin: 1000, estimatedDealMax: 2000 });
    await transitionLeadStatus(prisma, { leadId: lead.id, nextStatus: "SITE_READY" });
    await transitionLeadStatus(prisma, { leadId: lead.id, nextStatus: "PITCHED" });

    // A second website project for an already-PITCHED lead: there is no
    // forward transition left to make (PITCHED -> SITE_READY is illegal),
    // so this must record the activity directly and leave status untouched.
    await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content({ businessName: "Second Site" }) });

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead?.status).toBe("PITCHED"); // unchanged

    // 2 total: one from the earlier real SITE_READY transition above, one
    // from this second website's direct (non-transition) recordActivity.
    const activities = await prisma.activity.findMany({ where: { leadId: lead.id, type: "WEBSITE_GENERATED" } });
    expect(activities).toHaveLength(2);
  });

  it("records WEBSITE_GENERATED directly for a NEW (never-analyzed) lead, without transitioning status", async () => {
    const { user, lead } = await newLead("website-generated-new-lead");

    await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead?.status).toBe("NEW"); // NEW -> SITE_READY is not a legal transition

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id, type: "WEBSITE_GENERATED" } });
    expect(activities).toHaveLength(1);
  });
});

describe("createNewWebsiteVersion (tests 6, 7, 15, 16)", () => {
  it("creates version 2 while leaving version 1 completely unchanged", async () => {
    const { user, lead } = await newLead("versioning");
    const v1 = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content({ theme: "clean" }) });
    const originalV1Snapshot = { ...v1.versions[0] };

    const v2 = await createNewWebsiteVersion(prisma, user.id, v1.id, { contentJSON: content({ theme: "bold" }) });

    expect(v2.versions).toHaveLength(2);
    expect(v2.versions.map((v) => v.versionNumber)).toEqual([1, 2]);

    const persistedV1 = await prisma.websiteVersion.findUnique({ where: { id: originalV1Snapshot.id } });
    expect(persistedV1?.theme).toBe("clean");
    expect(persistedV1?.contentJSON).toEqual(originalV1Snapshot.contentJSON);
    expect(persistedV1?.versionNumber).toBe(1);

    const persistedV2 = v2.versions[1];
    expect(persistedV2?.versionNumber).toBe(2);
    expect(persistedV2?.theme).toBe("bold");

    // The project's own denormalized "current" fields reflect the latest version.
    expect(v2.theme).toBe("bold");
  });

  it("creates three sequential versions, each preserving all prior ones", async () => {
    const { user, lead } = await newLead("versioning-sequence");
    const created = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    await createNewWebsiteVersion(prisma, user.id, created.id, { contentJSON: content({ theme: "v2" }) });
    const afterThird = await createNewWebsiteVersion(prisma, user.id, created.id, { contentJSON: content({ theme: "v3" }) });

    expect(afterThird.versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(afterThird.versions.map((v) => v.theme)).toEqual(["clean", "v2", "v3"]);
  });

  it("rejects a new version for another user's project, and existing history is untouched", async () => {
    const { user, lead } = await newLead("version-owner-a");
    const other = await createTestUser("version-owner-b");
    createdUserIds.push(other.id);
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    await expect(createNewWebsiteVersion(prisma, other.id, project.id, { contentJSON: content({ theme: "hijacked" }) })).rejects.toThrow(NotFoundError);

    const versions = await prisma.websiteVersion.findMany({ where: { websiteProjectId: project.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.theme).toBe("clean");
  });
});

describe("publishWebsiteProject (tests 17, 18)", () => {
  it("publishes a DRAFT project, setting status and a publishedUrl derived from its slug", async () => {
    const { user, lead } = await newLead("publish");
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    const published = await publishWebsiteProject(prisma, user.id, project.id);

    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedUrl).toContain(project.slug);
  });

  it("rejects publishing an already-published project (invalid publish state)", async () => {
    const { user, lead } = await newLead("publish-twice");
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });
    await publishWebsiteProject(prisma, user.id, project.id);

    await expect(publishWebsiteProject(prisma, user.id, project.id)).rejects.toThrow(InvalidWebsiteTransitionError);
  });

  it("publishing does not modify WebsiteVersion history", async () => {
    const { user, lead } = await newLead("publish-preserves-history");
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });
    const versionsBefore = await prisma.websiteVersion.findMany({ where: { websiteProjectId: project.id } });

    await publishWebsiteProject(prisma, user.id, project.id);

    const versionsAfter = await prisma.websiteVersion.findMany({ where: { websiteProjectId: project.id } });
    expect(versionsAfter).toEqual(versionsBefore);
  });

  it("rejects publishing another user's project", async () => {
    const { user, lead } = await newLead("publish-owner-a");
    const other = await createTestUser("publish-owner-b");
    createdUserIds.push(other.id);
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    await expect(publishWebsiteProject(prisma, other.id, project.id)).rejects.toThrow(NotFoundError);
    const stillDraft = await prisma.websiteProject.findUnique({ where: { id: project.id } });
    expect(stillDraft?.status).toBe("DRAFT");
  });

  // Phase 8 section 12: DEMO_PUBLISHED has no corresponding LeadStatus (it
  // is not a lifecycle stage), so publishing must record it as a direct
  // Activity and must never touch Lead.status.
  it("records DEMO_PUBLISHED as a direct activity, without any lifecycle transition", async () => {
    const { user, lead } = await newLead("publish-demo-published");
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });
    const statusBefore = (await prisma.lead.findUnique({ where: { id: lead.id } }))?.status;

    await publishWebsiteProject(prisma, user.id, project.id);

    const statusAfter = (await prisma.lead.findUnique({ where: { id: lead.id } }))?.status;
    expect(statusAfter).toBe(statusBefore); // publish never changes Lead.status

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id, type: "DEMO_PUBLISHED" } });
    expect(activities).toHaveLength(1);
  });
});

describe("getWebsiteProjectForUser / listWebsiteProjectsForUser (tests 3, 10)", () => {
  it("returns the full project with ordered version history for its owner", async () => {
    const { user, lead } = await newLead("get-detail");
    const created = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });
    await createNewWebsiteVersion(prisma, user.id, created.id, { contentJSON: content({ theme: "v2" }) });

    const detail = await getWebsiteProjectForUser(prisma, user.id, created.id);
    expect(detail.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
  });

  it("throws NotFoundError for another user's project (no data leakage)", async () => {
    const { user, lead } = await newLead("get-owner-a");
    const other = await createTestUser("get-owner-b");
    createdUserIds.push(other.id);
    const project = await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });

    await expect(getWebsiteProjectForUser(prisma, other.id, project.id)).rejects.toThrow(NotFoundError);
  });

  it("lists only the authenticated user's own website projects", async () => {
    const { user, lead } = await newLead("list-mine");
    const { user: other, lead: otherLead } = await newLead("list-other");
    await createWebsiteProject(prisma, user.id, { leadId: lead.id, contentJSON: content() });
    await createWebsiteProject(prisma, other.id, { leadId: otherLead.id, contentJSON: content() });

    const mine = await listWebsiteProjectsForUser(prisma, user.id, { page: 1, pageSize: 20 });
    expect(mine.total).toBe(1);
    expect(mine.items[0]?.leadId).toBe(lead.id);
  });

  it("filters by leadId", async () => {
    const { user, lead: leadA } = await newLead("filter-lead-a");
    const campaignB = await createCampaign(prisma, user.id, { name: "Second", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
    providerSeq += 1;
    const { lead: leadB } = await ingestBusinessAsLead(prisma, {
      campaignId: campaignB.id,
      providerInput: { name: "Other Clinic", category: "Dental Clinic", address: null, city: null, phone: null, email: null, website: null, instagram: null, facebook: null, rating: null, reviewCount: null, latitude: null, longitude: null, source: "demo", externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}` },
    });

    await createWebsiteProject(prisma, user.id, { leadId: leadA.id, contentJSON: content() });
    await createWebsiteProject(prisma, user.id, { leadId: leadB.id, contentJSON: content() });

    const filtered = await listWebsiteProjectsForUser(prisma, user.id, { page: 1, pageSize: 20, leadId: leadA.id });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.leadId).toBe(leadA.id);
  });
});

// Slug collision and version-numbering concurrency (tests 8, 19) are
// deterministically forced with a minimal fake Prisma client — there is no
// reliable way to force a real slug or version-number collision against a
// healthy live database (same documented approach used throughout this
// project's test suite for forced-failure scenarios, e.g.
// lib/campaigns/run.service.test.ts's per-business failure isolation
// tests). This proves the *retry logic* is correct; genuine concurrent-
// thread safety additionally relies on Postgres enforcing the underlying
// unique constraints, which this fake does not itself prove.
function createFakeWebsiteDb() {
  const projects = new Map<string, Record<string, unknown>>();
  const versions: Array<Record<string, unknown>> = [];
  let projectSeq = 0;
  let versionSeq = 0;
  let projectCreateCalls = 0;
  let versionCreateCalls = 0;

  function p2002(message: string): Error {
    const error = new Error(message) as Error & { code: string };
    error.code = "P2002";
    return error;
  }

  const client = {
    lead: {
      // status: "ANALYZED" so createWebsiteProject's SITE_READY transition
      // check has a real status to evaluate, same as any freshly-analyzed
      // lead in production.
      findUnique: async () => ({ id: "lead-1", status: "ANALYZED", campaign: { userId: "user-1" }, business: { name: "Retry Test Clinic" } }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({ id: "lead-1", status: "SITE_READY", ...data }),
    },
    activity: {
      create: async () => ({ id: "activity-1" }),
    },
    websiteProject: {
      // loadOwnedWebsiteProject always requests `include: { lead: { select:
      // { campaign: { select: { userId } } } } }` — the fake returns that
      // shape unconditionally rather than branching on the include arg,
      // since every caller in this file needs the same ownership shape.
      findUnique: async ({ where }: { where: { id: string } }) => (projects.has(where.id) ? { ...projects.get(where.id), lead: { campaign: { userId: "user-1" } } } : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        projectCreateCalls += 1;
        if (projectCreateCalls === 1) throw p2002("Unique constraint failed on the fields: (`slug`)");
        projectSeq += 1;
        const project = { id: `project-${projectSeq}`, ...data };
        projects.set(project.id, project);
        return project;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const updated = { ...projects.get(where.id), ...data };
        projects.set(where.id, updated);
        return updated;
      },
    },
    websiteVersion: {
      findFirst: async ({ where }: { where: { websiteProjectId: string } }) => {
        const matches = versions.filter((v) => v.websiteProjectId === where.websiteProjectId).sort((a, b) => (b.versionNumber as number) - (a.versionNumber as number));
        return matches[0] ?? null;
      },
      findMany: async ({ where }: { where: { websiteProjectId: string } }) =>
        versions.filter((v) => v.websiteProjectId === where.websiteProjectId).sort((a, b) => (a.versionNumber as number) - (b.versionNumber as number)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        versionCreateCalls += 1;
        // Simulates a concurrent request winning the race for versionNumber
        // 2: its row is actually inserted (so the retry's re-read of "max
        // versionNumber" genuinely sees it), and *our* insert collides on
        // the unique constraint, the same way two real concurrent
        // transactions would both compute nextVersionNumber=2 and only one
        // could win.
        if (versionCreateCalls === 2 && data.versionNumber === 2) {
          versionSeq += 1;
          versions.push({ id: `version-${versionSeq}`, websiteProjectId: data.websiteProjectId, versionNumber: 2, template: "concurrent-winner", theme: "concurrent-winner", contentJSON: {}, designJSON: null, demoUrl: null });
          throw p2002("Unique constraint failed on the fields: (`websiteProjectId`,`versionNumber`)");
        }
        versionSeq += 1;
        const version = { id: `version-${versionSeq}`, ...data };
        versions.push(version);
        return version;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };

  return { db: client as never, getProjectCreateCalls: () => projectCreateCalls, getVersionCreateCalls: () => versionCreateCalls, getVersions: () => versions };
}

describe("slug and version-number collision retry (tests 8, 19)", () => {
  it("retries with a new slug after a unique-constraint collision instead of failing the whole operation", async () => {
    const { db, getProjectCreateCalls } = createFakeWebsiteDb();
    const project = await createWebsiteProject(db, "user-1", { leadId: "lead-1", contentJSON: content() });

    expect(project.slug).toBeTruthy();
    expect(getProjectCreateCalls()).toBe(2); // first attempt collided, second succeeded
  });

  it("retries version-number computation after losing a concurrent-insert race instead of failing or skipping a number", async () => {
    const { db, getVersionCreateCalls, getVersions } = createFakeWebsiteDb();
    const project = await createWebsiteProject(db, "user-1", { leadId: "lead-1", contentJSON: content() });

    const result = await createNewWebsiteVersion(db, "user-1", project.id, { contentJSON: content({ theme: "v2" }) });

    expect(getVersionCreateCalls()).toBe(3); // v1 (project creation) + collided v2 attempt (concurrent winner) + our successful retry
    // version 2 belongs to the "concurrent winner," not us — our own
    // content safely landed as version 3, proving no version number was
    // silently skipped or duplicated.
    expect(getVersions().map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(result.versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(result.versions[2]?.theme).toBe("v2"); // our content is the one that ended up as version 3
  });
});

describe("isUniqueConstraintViolation reuse", () => {
  it("recognizes a P2002 error the same way the rest of the codebase does", () => {
    const error = Object.assign(new Error("dup"), { code: "P2002" });
    expect(isUniqueConstraintViolation(error)).toBe(true);
  });
});
