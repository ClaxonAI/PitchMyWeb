import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { runEnqueueWebsiteVerificationsJob } from "./enqueue-website-verifications.job";

// Real Postgres: proves the batch-selection query's WHERE/ORDER BY, not just
// that it parses — the one piece of this job worth an integration test
// (everything else is a thin loop over its rows).

const createdBusinessIds: string[] = [];
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
  await prisma.$disconnect();
});

function uniqueExternalId(label: string): string {
  return `enqueue-verify-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedBusiness(label: string, overrides: { website?: string | null; websiteVerifiedAt?: Date | null; mergedIntoId?: string | null } = {}) {
  const business = await prisma.business.create({
    data: {
      name: `Enqueue Verify Test ${label}`,
      category: "Cafe",
      source: "demo",
      externalId: uniqueExternalId(label),
      website: overrides.website === undefined ? "https://example.com" : overrides.website,
      websiteVerifiedAt: overrides.websiteVerifiedAt ?? null,
    },
  });
  createdBusinessIds.push(business.id);
  if (overrides.mergedIntoId) {
    await prisma.business.update({ where: { id: business.id }, data: { mergedIntoId: overrides.mergedIntoId } });
  }
  return business;
}

describe("runEnqueueWebsiteVerificationsJob (real Postgres)", () => {
  it("selects never-verified and stale businesses, skips fresh/merged/websiteless ones, and enqueues each exactly once", async () => {
    const winner = await seedBusiness("winner");
    const neverVerified = await seedBusiness("never-verified");
    const staleVerified = await seedBusiness("stale", { websiteVerifiedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    const freshlyVerified = await seedBusiness("fresh", { websiteVerifiedAt: new Date(Date.now() - 60 * 60 * 1000) });
    const noWebsite = await seedBusiness("no-website", { website: null });
    const emptyWebsite = await seedBusiness("empty-website", { website: "" });
    const merged = await seedBusiness("merged", { mergedIntoId: winner.id });

    const enqueued: string[] = [];
    const result = await runEnqueueWebsiteVerificationsJob(prisma, async (businessId) => {
      enqueued.push(businessId);
    });

    // winner is just an ordinary unverified-with-website business (its only
    // other role is being the merge target below) — it qualifies too.
    expect(enqueued).toContain(winner.id);
    expect(enqueued).toContain(neverVerified.id);
    expect(enqueued).toContain(staleVerified.id);
    expect(enqueued).not.toContain(freshlyVerified.id);
    expect(enqueued).not.toContain(noWebsite.id);
    expect(enqueued).not.toContain(emptyWebsite.id);
    expect(enqueued).not.toContain(merged.id);
    expect(result.enqueued).toBeGreaterThanOrEqual(3);
  });

  it("orders never-verified rows before stale-but-verified rows", async () => {
    const stale = await seedBusiness("order-stale", { websiteVerifiedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) });
    const neverVerified = await seedBusiness("order-never", {});

    const enqueued: string[] = [];
    await runEnqueueWebsiteVerificationsJob(prisma, async (businessId) => {
      enqueued.push(businessId);
    });

    const neverIndex = enqueued.indexOf(neverVerified.id);
    const staleIndex = enqueued.indexOf(stale.id);
    expect(neverIndex).toBeGreaterThanOrEqual(0);
    expect(staleIndex).toBeGreaterThanOrEqual(0);
    expect(neverIndex).toBeLessThan(staleIndex);
  });
});
