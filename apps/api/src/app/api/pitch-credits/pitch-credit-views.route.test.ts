import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueIndianPhone } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { NotFoundError, UnauthenticatedError } from "../../../lib/errors";
import { createCampaign } from "../../../lib/campaigns/campaign.service";
import { selectLeads } from "../../../lib/campaigns/selection.service";
import { ensureFreeGrant, grantCredits } from "../../../lib/checkout/wallet.service";
import { ingestBusinessAsLead } from "../../../lib/leads/lead.service";
import type { BusinessProviderInput } from "../../../lib/validation/business";
import { handleCampaignBatches } from "../campaigns/[id]/batches/route";
import { handleCreditLedger } from "./ledger/route";

// The two read endpoints the credit UI is built on, tested together because
// they are two views of one story — a batch reserving credits and the ledger
// recording that it did. Driven through the real selection path rather than
// hand-written PitchBatch/PitchCreditLedger rows: what is worth checking is
// that these views agree with what the reservation engine actually wrote.

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "pitch-credit-views-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

function req(url: string, init: { cookieHeader?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.cookieHeader) headers.cookie = init.cookieHeader;
  return new NextRequest(url, { method: "GET", headers });
}

let providerSeq = 0;
function providerInput(): BusinessProviderInput {
  providerSeq += 1;
  return {
    name: `Credit View Business ${providerSeq}`,
    category: "Dental Clinic",
    address: null,
    city: "Chennai",
    phone: uniqueIndianPhone(),
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4,
    reviewCount: 20,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

/** A user with credits, a PROCESSING campaign, and `leadCount` pitchable leads. */
async function fixture(prefix: string, leadCount: number, credits: number) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const session = await createSession(prisma, user.id);
  const campaign = await createCampaign(prisma, user.id, {
    name: "Credit Views Test",
    location: "Chennai",
    category: "Dental Clinic",
    websiteRequirement: "ANY",
    leadLimit: 200,
    targetCount: 200,
  });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PROCESSING" } });
  // Every real account's ledger opens with the free grant, applied lazily the
  // first time anything reads its access (GET /api/me, at login). Applied
  // explicitly here because this fixture never goes through that path, and a
  // ledger fixture missing its oldest entry would be the wrong shape to test
  // ordering and pagination against.
  await ensureFreeGrant(prisma, user.id);
  await grantCredits(prisma, { userId: user.id, amount: credits, type: "PURCHASE", referenceId: `purchase:${user.id}` });
  for (let i = 0; i < leadCount; i += 1) {
    await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: providerInput() });
  }
  const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
  return { user, campaign, leads, cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` };
}

describe("GET /api/campaigns/:id/batches", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleCampaignBatches(prisma, req("http://localhost/api/campaigns/x/batches"), { id: "x" })).rejects.toThrow(UnauthenticatedError);
  });

  it("does not expose another user's campaign", async () => {
    const owner = await fixture("batches-owner", 1, 5);
    const other = await fixture("batches-other", 0, 5);
    await expect(handleCampaignBatches(prisma, req("http://localhost/x", { cookieHeader: other.cookieHeader }), { id: owner.campaign.id })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("is empty for a campaign nobody has pitched from yet", async () => {
    const { campaign, cookieHeader } = await fixture("batches-empty", 2, 5);
    const response = await handleCampaignBatches(prisma, req("http://localhost/x", { cookieHeader }), { id: campaign.id });
    expect(await response.json()).toEqual({ items: [] });
  });

  it("reports what was asked for, what was reserved, and what is still in flight", async () => {
    const { user, campaign, leads, cookieHeader } = await fixture("batches-progress", 3, 10);
    await selectLeads(prisma, user.id, campaign.id, leads.map((lead) => lead.id), { enqueueRecording: async () => undefined });

    const response = await handleCampaignBatches(prisma, req("http://localhost/x", { cookieHeader }), { id: campaign.id });
    const body = (await response.json()) as { items: Array<Record<string, unknown>> };

    expect(body.items).toHaveLength(1);
    const batch = body.items[0]!;
    expect(batch).toMatchObject({
      mode: "MANUAL",
      status: "PROCESSING",
      requestedCount: 3,
      reservedCount: 3,
      sentCount: 0,
      failedCount: 0,
      refundedCount: 0,
      // Nothing has resolved its credit either way, so every reserved slot
      // is still working — which is what the progress UI reports.
      processingCount: 3,
    });

    // Stage counts come from the pipelines themselves, so they add up to the
    // reserved count however far through the pipeline those pipelines got.
    const stages = batch.stages as Record<string, number>;
    expect(Object.values(stages).reduce((sum, count) => sum + count, 0)).toBe(3);
  });

  it("counts a resolved pitch as no longer processing", async () => {
    const { user, campaign, leads, cookieHeader } = await fixture("batches-resolved", 2, 10);
    await selectLeads(prisma, user.id, campaign.id, leads.map((lead) => lead.id), { enqueueRecording: async () => undefined });
    const batchRow = await prisma.pitchBatch.findFirstOrThrow({ where: { campaignId: campaign.id } });
    // Stands in for one pitch finally failing and refunding, without
    // reaching into the pipeline's own failure path — this endpoint reads
    // the counters, and what is under test is how it reads them.
    await prisma.pitchBatch.update({ where: { id: batchRow.id }, data: { failedCount: 1, refundedCount: 1 } });

    const response = await handleCampaignBatches(prisma, req("http://localhost/x", { cookieHeader }), { id: campaign.id });
    const body = (await response.json()) as { items: Array<{ processingCount: number; failedCount: number }> };
    expect(body.items[0]).toMatchObject({ failedCount: 1, processingCount: 1 });
  });
});

describe("GET /api/pitch-credits/ledger", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleCreditLedger(prisma, req("http://localhost/api/pitch-credits/ledger"))).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the caller's own movements, newest first, with the balance they add up to", async () => {
    const { user, campaign, leads, cookieHeader } = await fixture("ledger-history", 2, 10);
    await selectLeads(prisma, user.id, campaign.id, leads.map((lead) => lead.id), { enqueueRecording: async () => undefined });

    const response = await handleCreditLedger(prisma, req("http://localhost/api/pitch-credits/ledger", { cookieHeader }));
    const body = (await response.json()) as {
      wallet: { availableCredits: number; reservedCredits: number };
      items: Array<{ type: string; amount: number; batchId: string | null }>;
      total: number;
      page: number;
      totalPages: number;
    };

    // The free grant, the purchase this fixture made, and the reservation
    // the selection took — in reverse chronological order.
    expect(body.items.map((entry) => entry.type)).toEqual(["RESERVE", "PURCHASE", "FREE_GRANT"]);
    expect(body.items[0]).toMatchObject({ type: "RESERVE", amount: 2 });
    expect(body.items[0]!.batchId).not.toBeNull();
    expect(body.wallet).toMatchObject({ reservedCredits: 2 });
    expect(body).toMatchObject({ total: 3, page: 1, totalPages: 1 });
  });

  it("never returns another user's movements", async () => {
    const { user, campaign, leads } = await fixture("ledger-owner", 2, 10);
    await selectLeads(prisma, user.id, campaign.id, leads.map((lead) => lead.id), { enqueueRecording: async () => undefined });
    const other = await fixture("ledger-other", 0, 7);

    const response = await handleCreditLedger(prisma, req("http://localhost/api/pitch-credits/ledger", { cookieHeader: other.cookieHeader }));
    const body = (await response.json()) as { items: Array<{ type: string; amount: number }>; total: number };

    // Its own grant and purchase, and nothing from the busy account above.
    expect(body.items.map((entry) => entry.type).sort()).toEqual(["FREE_GRANT", "PURCHASE"]);
    expect(body.total).toBe(2);
  });

  it("paginates", async () => {
    const { user, campaign, leads, cookieHeader } = await fixture("ledger-paged", 1, 10);
    await selectLeads(prisma, user.id, campaign.id, leads.map((lead) => lead.id), { enqueueRecording: async () => undefined });

    const first = await handleCreditLedger(prisma, req("http://localhost/api/pitch-credits/ledger?page=1&pageSize=2", { cookieHeader }));
    const firstBody = (await first.json()) as { items: unknown[]; total: number; totalPages: number };
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody).toMatchObject({ total: 3, totalPages: 2 });

    const second = await handleCreditLedger(prisma, req("http://localhost/api/pitch-credits/ledger?page=2&pageSize=2", { cookieHeader }));
    const secondBody = (await second.json()) as { items: Array<{ type: string }> };
    expect(secondBody.items.map((entry) => entry.type)).toEqual(["FREE_GRANT"]);
  });
});
