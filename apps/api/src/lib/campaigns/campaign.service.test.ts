import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { NotFoundError, InvalidCampaignTransitionError, ConflictError } from "../errors";
import { createCampaign, getCampaignById, listCampaignsForUser, markCampaignReady, prepareCampaignRun, updateCampaign } from "./campaign.service";
import type { CampaignCreateInput } from "../validation/campaign";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

const baseCampaignInput: CampaignCreateInput = {
  name: "Chennai Dentists",
  location: "Chennai",
  category: "Dental Clinic",
  websiteRequirement: "ANY",
  leadLimit: 10,
};

async function newUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  return user;
}

describe("createCampaign", () => {
  it("always starts a new campaign at DRAFT regardless of caller intent", async () => {
    const user = await newUser("create");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.userId).toBe(user.id);
  });
});

describe("getCampaignById ownership", () => {
  it("returns the campaign for its owner", async () => {
    const user = await newUser("owner-get");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    const fetched = await getCampaignById(prisma, user.id, campaign.id);
    expect(fetched.id).toBe(campaign.id);
  });

  it("throws NotFoundError for a different user (no data leakage)", async () => {
    const owner = await newUser("owner-a");
    const other = await newUser("owner-b");
    const campaign = await createCampaign(prisma, owner.id, baseCampaignInput);

    await expect(getCampaignById(prisma, other.id, campaign.id)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError for a nonexistent campaign id", async () => {
    const user = await newUser("owner-missing");
    await expect(getCampaignById(prisma, user.id, "does-not-exist")).rejects.toThrow(NotFoundError);
  });
});

describe("updateCampaign", () => {
  it("applies editable-field changes while DRAFT", async () => {
    const user = await newUser("update-draft");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    const updated = await updateCampaign(prisma, user.id, campaign.id, { leadLimit: 25 });
    expect(updated.leadLimit).toBe(25);
    expect(updated.status).toBe("DRAFT");
  });

  // "How many leads" on the dashboard is targetCount; leadLimit is the cap
  // discovery actually searches against. Editing one without the other is
  // how a campaign edited down to 5 kept scraping its original 20.
  it("moves leadLimit with targetCount when the caller does not set it explicitly", async () => {
    const user = await newUser("update-target-count");
    const campaign = await createCampaign(prisma, user.id, { ...baseCampaignInput, leadLimit: undefined, targetCount: 20 });
    expect(campaign.leadLimit).toBe(20);

    const updated = await updateCampaign(prisma, user.id, campaign.id, { targetCount: 5 });

    expect(updated.targetCount).toBe(5);
    expect(updated.leadLimit).toBe(5);
  });

  it("lets an explicit leadLimit win over the one derived from targetCount", async () => {
    const user = await newUser("update-target-count-explicit");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    const updated = await updateCampaign(prisma, user.id, campaign.id, { targetCount: 5, leadLimit: 40 });
    expect(updated.leadLimit).toBe(40);
  });

  it("never writes a client-supplied status as a raw field, even though the schema allows the literal", async () => {
    const user = await newUser("update-status-noop");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    // updateCampaign is called directly here (bypassing the route's
    // markCampaignReady branch) to prove the service itself strips status.
    const updated = await updateCampaign(prisma, user.id, campaign.id, { status: "READY", leadLimit: 3 });
    expect(updated.status).toBe("DRAFT");
    expect(updated.leadLimit).toBe(3);
  });

  // Phase 4 code-review finding #1 regression test, at the service layer:
  // an update touching only an unrelated field must never change
  // websiteRequirement. (The Zod-level guarantee is tested in
  // lib/validation/validation.test.ts; this proves the fix holds all the
  // way through to a persisted row.)
  it("PATCH omission preserves an existing non-default websiteRequirement (WITHOUT_WEBSITE)", async () => {
    const user = await newUser("patch-preserve-without-website");
    const campaign = await createCampaign(prisma, user.id, { ...baseCampaignInput, websiteRequirement: "WITHOUT_WEBSITE" });
    expect(campaign.websiteRequirement).toBe("WITHOUT_WEBSITE");

    const updated = await updateCampaign(prisma, user.id, campaign.id, { leadLimit: 99 });

    expect(updated.leadLimit).toBe(99);
    expect(updated.websiteRequirement).toBe("WITHOUT_WEBSITE");
  });

  it("PATCH omission preserves an existing non-default websiteRequirement (WITH_WEBSITE)", async () => {
    const user = await newUser("patch-preserve-with-website");
    const campaign = await createCampaign(prisma, user.id, { ...baseCampaignInput, websiteRequirement: "WITH_WEBSITE" });

    const updated = await updateCampaign(prisma, user.id, campaign.id, { name: "Renamed Campaign" });

    expect(updated.name).toBe("Renamed Campaign");
    expect(updated.websiteRequirement).toBe("WITH_WEBSITE");
  });

  it("rejects edits to another user's campaign", async () => {
    const owner = await newUser("update-owner-a");
    const other = await newUser("update-owner-b");
    const campaign = await createCampaign(prisma, owner.id, baseCampaignInput);
    await expect(updateCampaign(prisma, other.id, campaign.id, { leadLimit: 1 })).rejects.toThrow(NotFoundError);
  });

  it("rejects edits once the campaign has left the editable states", async () => {
    const user = await newUser("update-locked");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    await markCampaignReady(prisma, user.id, campaign.id);
    await prepareCampaignRun(prisma, user.id, campaign.id); // -> RUNNING

    await expect(updateCampaign(prisma, user.id, campaign.id, { leadLimit: 1 })).rejects.toThrow(ConflictError);
  });
});

describe("listCampaignsForUser", () => {
  it("only returns campaigns owned by the given user, paginated", async () => {
    const owner = await newUser("list-owner");
    const other = await newUser("list-other");
    await createCampaign(prisma, owner.id, { ...baseCampaignInput, name: "A" });
    await createCampaign(prisma, owner.id, { ...baseCampaignInput, name: "B" });
    await createCampaign(prisma, other.id, { ...baseCampaignInput, name: "Not mine" });

    const result = await listCampaignsForUser(prisma, owner.id, { page: 1, pageSize: 20 });
    expect(result.total).toBe(2);
    expect(result.items.every((c) => c.userId === owner.id)).toBe(true);
  });

  it("filters by status", async () => {
    const user = await newUser("list-status");
    const draft = await createCampaign(prisma, user.id, { ...baseCampaignInput, name: "Draft one" });
    const ready = await createCampaign(prisma, user.id, { ...baseCampaignInput, name: "Ready one" });
    await markCampaignReady(prisma, user.id, ready.id);

    const result = await listCampaignsForUser(prisma, user.id, { page: 1, pageSize: 20, status: "READY" });
    expect(result.items.map((c) => c.id)).toEqual([ready.id]);
    expect(result.items.map((c) => c.id)).not.toContain(draft.id);
  });
});

describe("prepareCampaignRun concurrency guard", () => {
  it("allows exactly one of two sequential run attempts on the same campaign to succeed", async () => {
    const user = await newUser("concurrency");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    await markCampaignReady(prisma, user.id, campaign.id);

    const first = await prepareCampaignRun(prisma, user.id, campaign.id);
    expect(first.status).toBe("RUNNING");

    // A second attempt against the same now-RUNNING campaign must be
    // rejected by the atomic conditional update, not silently re-applied
    // (section 8: "prevent two concurrent requests from starting the same
    // campaign simultaneously"). This proves the *logic*; true concurrent-
    // thread safety additionally relies on Postgres serializing the two
    // UPDATEs, which a single-process sequential test cannot itself
    // exercise (same caveat lib/business/dedupe.test.ts documents).
    await expect(prepareCampaignRun(prisma, user.id, campaign.id)).rejects.toThrow(InvalidCampaignTransitionError);

    const current = await getCampaignById(prisma, user.id, campaign.id);
    expect(current.status).toBe("RUNNING");
  });

  it("rejects running a campaign that never left DRAFT", async () => {
    const user = await newUser("concurrency-draft");
    const campaign = await createCampaign(prisma, user.id, baseCampaignInput);
    await expect(prepareCampaignRun(prisma, user.id, campaign.id)).rejects.toThrow(InvalidCampaignTransitionError);
  });
});
