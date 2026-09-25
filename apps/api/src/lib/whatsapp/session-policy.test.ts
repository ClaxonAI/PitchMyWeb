import { afterAll, describe, expect, it } from "vitest";
import type { PipelineStage, WhatsAppStatus } from "@pitchmyweb/db";
import type { SessionCommand } from "@pitchmyweb/contracts";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import {
  ACTIVE_WORK_MAX_AGE_MS,
  assertWhatsAppReady,
  decideSession,
  settleWhatsAppSession,
  sweepWhatsAppSessions,
  UNUSED_LINK_TIMEOUT_MS,
  WhatsAppNotConnectedError,
  type SessionPolicyDeps,
} from "./session-policy";

const SOURCE = "session-policy:test";
const HOUR = 60 * 60 * 1000;
const createdUserIds: string[] = [];
let seq = 0;

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.business.deleteMany({ where: { source: SOURCE } });
  await prisma.$disconnect();
});

/** Records sign-out commands instead of putting them on the real queue. */
function fakeQueue() {
  const commands: Array<{ command: SessionCommand; jobId?: string }> = [];
  const deps: SessionPolicyDeps = {
    enqueueSessionCommand: async (command, options = {}) => void commands.push({ command, jobId: options.jobId }),
  };
  return { deps, commands };
}

async function user(label: string) {
  const created = await createTestUser(`wa-policy-${label}`);
  createdUserIds.push(created.id);
  return created;
}

async function account(userId: string, data: { linkedAt: Date | null; status?: WhatsAppStatus }) {
  return prisma.whatsAppAccount.create({
    data: { userId, status: data.status ?? "CONNECTED", phoneNumber: "919800000001", linkedAt: data.linkedAt },
  });
}

async function campaign(userId: string, data: { deliveryMode?: "AUTO" | "DIRECT"; selectionMode?: "AUTO" | "MANUAL"; status?: "COMPLETED" | "PROCESSING" } = {}) {
  return prisma.campaign.create({
    data: {
      userId,
      name: "Policy test",
      location: "Chennai",
      category: "Dental Clinic",
      leadLimit: 10,
      status: data.status ?? "COMPLETED",
      deliveryMode: data.deliveryMode ?? "AUTO",
      selectionMode: data.selectionMode ?? "MANUAL",
    },
  });
}

async function batch(campaignId: string, userId: string, data: { status: "PROCESSING" | "COMPLETED"; completedAt?: Date | null }) {
  return prisma.pitchBatch.create({
    data: { campaignId, userId, requestedCount: 1, reservedCount: 1, mode: "MANUAL", status: data.status, completedAt: data.completedAt ?? null },
  });
}

async function pipeline(campaignId: string, batchId: string, stage: PipelineStage, updatedAt?: Date) {
  seq += 1;
  const business = await prisma.business.create({
    data: { name: `Policy clinic ${seq}`, category: "Dental Clinic", source: SOURCE, externalId: `sp-${Date.now()}-${seq}` },
  });
  const lead = await prisma.lead.create({ data: { campaignId, businessId: business.id } });
  const created = await prisma.leadPipeline.create({ data: { campaignId, leadId: lead.id, batchId, stage } });
  if (updatedAt) {
    // @updatedAt always stamps "now" through Prisma; backdate it directly.
    await prisma.$executeRaw`UPDATE "lead_pipelines" SET "updatedAt" = ${updatedAt} WHERE "id" = ${created.id}`;
  }
  return created;
}

async function logoutReason(accountId: string): Promise<string | null> {
  return (await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } })).logoutReason;
}

describe("decideSession", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  const base = { now, linkedAt: new Date(now.getTime() - HOUR), activeSending: false, campaignFinishedSinceLink: false };

  it("never signs out while a campaign is still sending, whatever else is true", () => {
    expect(decideSession({ ...base, activeSending: true, campaignFinishedSinceLink: true })).toEqual({ action: "keep", reason: "sending" });
    expect(decideSession({ ...base, activeSending: true, linkedAt: null })).toEqual({ action: "keep", reason: "sending" });
  });

  it("signs out as soon as a campaign has finished since this login", () => {
    expect(decideSession({ ...base, campaignFinishedSinceLink: true })).toEqual({ action: "sign_out", reason: "campaign_finished" });
  });

  it("gives a fresh link time to start its campaign, but not forever", () => {
    expect(decideSession(base)).toEqual({ action: "keep", reason: "waiting_for_campaign" });
    expect(decideSession({ ...base, linkedAt: new Date(now.getTime() - UNUSED_LINK_TIMEOUT_MS) })).toEqual({ action: "sign_out", reason: "unused" });
    expect(decideSession({ ...base, linkedAt: null })).toEqual({ action: "sign_out", reason: "unused" });
  });

});

describe("sweepWhatsAppSessions", () => {
  it("signs a number out once its campaign's last pitch has finished", async () => {
    const owner = await user("finished");
    const linkedAt = new Date(Date.now() - HOUR);
    const { id: campaignId } = await campaign(owner.id);
    const done = await batch(campaignId, owner.id, { status: "COMPLETED", completedAt: new Date() });
    await pipeline(campaignId, done.id, "SENT");
    const linked = await account(owner.id, { linkedAt });
    const { deps, commands } = fakeQueue();

    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);

    expect(await logoutReason(linked.id)).toBe("campaign_finished");
    expect(commands).toHaveLength(1);
    // The command names this login, so the worker can skip it if the user relinks first.
    expect(commands[0]!.command).toEqual({ type: "disconnect", accountId: linked.id, expectedLinkedAt: linkedAt.toISOString() });
    expect(commands[0]!.jobId).toMatch(new RegExp(`^auto-signout-${linked.id}-\\d+$`));
  });

  it("keeps the number while any pitch is still in flight, including one waiting for its retry", async () => {
    const owner = await user("in-flight");
    const first = await campaign(owner.id);
    await pipeline(first.id, (await batch(first.id, owner.id, { status: "COMPLETED", completedAt: new Date() })).id, "SENT");
    const second = await campaign(owner.id);
    const running = await batch(second.id, owner.id, { status: "PROCESSING" });
    const waiting = await pipeline(second.id, running.id, "DELIVERY_QUEUED");
    const linked = await account(owner.id, { linkedAt: new Date(Date.now() - 2 * UNUSED_LINK_TIMEOUT_MS) });
    const { deps, commands } = fakeQueue();

    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);
    expect(commands).toHaveLength(0);

    // A retryable failure keeps its credit reserved (creditOutcome null): the
    // campaign is not over yet.
    await prisma.leadPipeline.update({ where: { id: waiting.id }, data: { stage: "FAILED", failureReason: "internal_error" } });
    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);
    expect(commands).toHaveLength(0);
    expect(await logoutReason(linked.id)).toBeNull();
  });

  it("does not let a pipeline stuck for days keep a number linked forever", async () => {
    const owner = await user("stuck");
    const { id: campaignId } = await campaign(owner.id);
    const stuckBatch = await batch(campaignId, owner.id, { status: "PROCESSING" });
    await pipeline(campaignId, stuckBatch.id, "BUILDING_SITE", new Date(Date.now() - ACTIVE_WORK_MAX_AGE_MS - HOUR));
    const linked = await account(owner.id, { linkedAt: new Date(Date.now() - 5 * 24 * HOUR) });
    const { deps, commands } = fakeQueue();

    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);

    expect(commands).toHaveLength(1);
    expect(await logoutReason(linked.id)).toBe("unused");
  });

  it("keeps the number while discovery runs, and in the moment between discovery finishing and auto-selection", async () => {
    const owner = await user("discovering");
    // An earlier campaign already finished after this login…
    const earlier = await campaign(owner.id);
    await batch(earlier.id, owner.id, { status: "COMPLETED", completedAt: new Date() });
    // …but the next one is still searching.
    const next = await campaign(owner.id, { status: "PROCESSING", selectionMode: "AUTO" });
    await account(owner.id, { linkedAt: new Date(Date.now() - HOUR) });
    const { deps, commands } = fakeQueue();

    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);
    expect(commands).toHaveLength(0);

    // Discovery done, auto-selection about to create the batch.
    await prisma.campaign.update({ where: { id: next.id }, data: { status: "COMPLETED" } });
    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);
    expect(commands).toHaveLength(0);
  });

  it("ignores Direct campaigns, which never send from the linked number", async () => {
    const owner = await user("direct");
    const auto = await campaign(owner.id);
    await batch(auto.id, owner.id, { status: "COMPLETED", completedAt: new Date() });
    const direct = await campaign(owner.id, { deliveryMode: "DIRECT" });
    await pipeline(direct.id, (await batch(direct.id, owner.id, { status: "PROCESSING" })).id, "RECORDING");
    const linked = await account(owner.id, { linkedAt: new Date(Date.now() - HOUR) });
    const { deps, commands } = fakeQueue();

    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);

    expect(commands).toHaveLength(1);
    expect(await logoutReason(linked.id)).toBe("campaign_finished");
  });

  it("only counts campaigns that finished after this login", async () => {
    const owner = await user("before-login");
    const { id: campaignId } = await campaign(owner.id);
    await batch(campaignId, owner.id, { status: "COMPLETED", completedAt: new Date(Date.now() - 2 * HOUR) });
    const linked = await account(owner.id, { linkedAt: new Date(Date.now() - HOUR) });
    const { deps, commands } = fakeQueue();

    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);

    expect(commands).toHaveLength(0);
    expect(await logoutReason(linked.id)).toBeNull();
  });

  it("signs out after every campaign: there is no staying signed in for the next one", async () => {
    const owner = await user("per-campaign");
    const linkedAt = new Date(Date.now() - HOUR);
    const { id: campaignId } = await campaign(owner.id);
    await batch(campaignId, owner.id, { status: "COMPLETED", completedAt: new Date() });
    const linked = await account(owner.id, { linkedAt });
    const { deps, commands } = fakeQueue();

    await settleWhatsAppSession(prisma, owner.id, new Date(), deps);
    expect(commands).toHaveLength(1);
    expect(await logoutReason(linked.id)).toBe("campaign_finished");
  });

  it("wipes credentials left behind by an account that stopped on an error", async () => {
    const owner = await user("error-creds");
    const broken = await account(owner.id, { linkedAt: new Date(Date.now() - 2 * UNUSED_LINK_TIMEOUT_MS), status: "ERROR" });
    await prisma.whatsAppAuthKey.create({
      data: { accountId: broken.id, category: "creds", keyId: "default", ciphertext: Buffer.from("x"), iv: Buffer.from("y"), authTag: Buffer.from("z") },
    });
    const { deps, commands } = fakeQueue();

    await sweepWhatsAppSessions(prisma, new Date(), deps);

    expect(commands.map((entry) => entry.command.accountId)).toContain(broken.id);
  });

  it("leaves a link attempt in progress alone", async () => {
    const owner = await user("linking");
    const linking = await account(owner.id, { linkedAt: new Date(Date.now() - 2 * UNUSED_LINK_TIMEOUT_MS), status: "QR_READY" });
    const { deps, commands } = fakeQueue();

    await sweepWhatsAppSessions(prisma, new Date(), deps);

    expect(commands.map((entry) => entry.command.accountId)).not.toContain(linking.id);
  });
});

describe("assertWhatsAppReady", () => {
  it("requires a linked number for Auto campaigns only", async () => {
    const owner = await user("gate");
    await expect(assertWhatsAppReady(prisma, owner.id, { deliveryMode: "AUTO" })).rejects.toThrow(WhatsAppNotConnectedError);
    await expect(assertWhatsAppReady(prisma, owner.id, { deliveryMode: "DIRECT" })).resolves.toBeUndefined();

    await account(owner.id, { linkedAt: new Date(), status: "LOGGED_OUT" });
    await expect(assertWhatsAppReady(prisma, owner.id, { deliveryMode: "AUTO" })).rejects.toThrow(WhatsAppNotConnectedError);

    await prisma.whatsAppAccount.updateMany({ where: { userId: owner.id }, data: { status: "CONNECTED" } });
    await expect(assertWhatsAppReady(prisma, owner.id, { deliveryMode: "AUTO" })).resolves.toBeUndefined();
  });
});
