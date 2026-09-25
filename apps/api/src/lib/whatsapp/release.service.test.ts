import { afterAll, describe, expect, it } from "vitest";
import type { CampaignStatus, CreditOutcome, PipelineStage } from "@pitchmyweb/db";
import { prisma } from "../db/client";
import { connectTestWhatsApp, createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { releaseWhatsAppForFinishedCampaigns } from "./release.service";

const SOURCE = "release:test";
const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.business.deleteMany({ where: { source: SOURCE } });
  await prisma.$disconnect();
});

/** Records unlink requests instead of enqueueing them for the worker. */
function fakeDeps() {
  const unlinked: string[] = [];
  return { deps: { disconnect: async (accountId: string) => void unlinked.push(accountId) }, unlinked };
}

async function linkedUser(label: string) {
  const user = await createTestUser(`release-${label}`);
  createdUserIds.push(user.id);
  const account = await connectTestWhatsApp(user.id);
  return { user, account };
}

async function campaignWithPitches(
  userId: string,
  status: CampaignStatus,
  pitches: Array<{ stage: PipelineStage; creditOutcome?: CreditOutcome | null }>,
) {
  const campaign = await prisma.campaign.create({
    data: { userId, name: "Release test", location: "Chennai", category: "Dental Clinic", leadLimit: 10, status },
  });
  const batch = await prisma.pitchBatch.create({
    data: { campaignId: campaign.id, userId, requestedCount: pitches.length, reservedCount: pitches.length, mode: "AUTO" },
  });
  for (const [index, pitch] of pitches.entries()) {
    const business = await prisma.business.create({ data: { name: `Release ${index} ${Date.now()}`, category: "Dental Clinic", source: SOURCE } });
    const lead = await prisma.lead.create({ data: { campaignId: campaign.id, businessId: business.id } });
    await prisma.leadPipeline.create({
      data: { campaignId: campaign.id, leadId: lead.id, batchId: batch.id, stage: pitch.stage, creditOutcome: pitch.creditOutcome ?? null },
    });
  }
  return campaign;
}

async function accountStatus(accountId: string) {
  return (await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } })).status;
}

describe("releaseWhatsAppForFinishedCampaigns", () => {
  it("unlinks once every pitch in the finished campaign has a final outcome", async () => {
    const { user, account } = await linkedUser("done");
    const campaign = await campaignWithPitches(user.id, "COMPLETED", [
      { stage: "SENT", creditOutcome: "CONSUMED" },
      { stage: "FAILED", creditOutcome: "REFUNDED" },
      { stage: "FAILED", creditOutcome: "REPLACED" },
    ]);
    const { deps, unlinked } = fakeDeps();

    await expect(releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: campaign.id }, deps)).resolves.toBe(1);
    expect(unlinked).toEqual([account.id]);
    expect(await accountStatus(account.id)).toBe("DISCONNECTED");
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).whatsappReleasedAt).not.toBeNull();

    // Idempotent: the campaign is already released.
    await expect(releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: campaign.id }, deps)).resolves.toBe(0);
    expect(unlinked).toHaveLength(1);
  });

  it("waits for delivery receipts: a sent pitch without one keeps WhatsApp linked", async () => {
    const { user, account } = await linkedUser("awaiting-receipt");
    const campaign = await campaignWithPitches(user.id, "COMPLETED", [{ stage: "SENT", creditOutcome: "CONSUMED" }, { stage: "DELIVERY_QUEUED" }]);
    const { deps, unlinked } = fakeDeps();

    await expect(releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: campaign.id }, deps)).resolves.toBe(0);
    expect(unlinked).toHaveLength(0);
    expect(await accountStatus(account.id)).toBe("CONNECTED");
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).whatsappReleasedAt).toBeNull();
  });

  it("keeps WhatsApp linked while pitches wait on a pause or an automatic retry", async () => {
    const { user, account } = await linkedUser("held");
    const paused = await campaignWithPitches(user.id, "COMPLETED", [{ stage: "VIDEO_UPLOADED" }]);
    const retrying = await campaignWithPitches(user.id, "COMPLETED", [{ stage: "FAILED", creditOutcome: null }]);
    const { deps, unlinked } = fakeDeps();

    await releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: paused.id }, deps);
    await releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: retrying.id }, deps);
    expect(unlinked).toHaveLength(0);
    expect(await accountStatus(account.id)).toBe("CONNECTED");
  });

  it("does not unlink while another of the user's campaigns is still working, then unlinks when it finishes", async () => {
    const { user, account } = await linkedUser("two-campaigns");
    const finished = await campaignWithPitches(user.id, "COMPLETED", [{ stage: "SENT", creditOutcome: "CONSUMED" }]);
    const working = await campaignWithPitches(user.id, "COMPLETED", [{ stage: "RECORDING" }]);
    const { deps, unlinked } = fakeDeps();

    await releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: finished.id }, deps);
    expect(unlinked).toHaveLength(0);
    expect(await accountStatus(account.id)).toBe("CONNECTED");

    await prisma.leadPipeline.updateMany({ where: { campaignId: working.id }, data: { stage: "SENT", creditOutcome: "CONSUMED" } });
    await releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: working.id }, deps);
    expect(unlinked).toEqual([account.id]);
    expect(await accountStatus(account.id)).toBe("DISCONNECTED");
  });

  it("does not unlink while another campaign is still discovering", async () => {
    const { user, account } = await linkedUser("discovering");
    const finished = await campaignWithPitches(user.id, "COMPLETED", []);
    await campaignWithPitches(user.id, "PROCESSING", []);
    const { deps, unlinked } = fakeDeps();

    await releaseWhatsAppForFinishedCampaigns(prisma, { campaignId: finished.id }, deps);
    expect(unlinked).toHaveLength(0);
    expect(await accountStatus(account.id)).toBe("CONNECTED");
  });

  it("never unlinks a user who has linked WhatsApp but not finished a campaign", async () => {
    const { user, account } = await linkedUser("fresh");
    await campaignWithPitches(user.id, "DRAFT", []);
    const { deps, unlinked } = fakeDeps();

    await releaseWhatsAppForFinishedCampaigns(prisma, {}, deps);
    expect(unlinked).not.toContain(account.id);
    expect(await accountStatus(account.id)).toBe("CONNECTED");
  });
});
