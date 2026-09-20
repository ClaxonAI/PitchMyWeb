import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../../../lib/testing/db-test-helpers";
import { createSession, SESSION_COOKIE_NAME } from "../../../../../lib/auth/session";
import { createCampaign, markCampaignReady } from "../../../../../lib/campaigns/campaign.service";
import { runCampaign } from "../../../../../lib/campaigns/run.service";
import { assertCampaignRunAllowed, isLeadDiscoveryPaused, maxRunsPerDay } from "../../../../../lib/campaigns/run-guards";
import { captureEvents } from "../../../../../lib/observability/events";
import type { AsyncLeadProvider } from "../../../../../lib/providers/async-provider";
import { DailyRunLimitError, LeadDiscoveryPausedError, RateLimitedError, UnauthenticatedError } from "../../../../../lib/errors";
import { handleRunCampaign } from "../../../campaigns/[id]/run/route";
import { handleExpireStaleRuns } from "./route";

const JOB_SECRET = "internal-jobs-test-secret-0123456789";
const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

const acceptingProvider: AsyncLeadProvider = { name: "osm", trigger: async () => ({ externalRunId: null }) };

async function readyCampaign(prefix: string) {
  const user = await createTestUser(`hardening-${prefix}`);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, {
    name: "hardening",
    location: "Chennai",
    category: "Dental Clinic",
    websiteRequirement: "ANY",
    leadLimit: 3,
  });
  await markCampaignReady(prisma, user.id, campaign.id);
  return { user, campaign };
}

function jobRequest(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new NextRequest("http://localhost/api/internal/jobs/expire-stale-runs", { method: "POST", headers });
}

describe("run guards — configuration parsing", () => {
  it("reads the pause switch", () => {
    expect(isLeadDiscoveryPaused({})).toBe(false);
    expect(isLeadDiscoveryPaused({ LEAD_DISCOVERY_PAUSED: "true" })).toBe(true);
    expect(isLeadDiscoveryPaused({ LEAD_DISCOVERY_PAUSED: " YES " })).toBe(true);
    expect(isLeadDiscoveryPaused({ LEAD_DISCOVERY_PAUSED: "false" })).toBe(false);
  });

  it("reads the daily cap, falling back to the default on junk", () => {
    expect(maxRunsPerDay({})).toBe(20);
    expect(maxRunsPerDay({ MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "5" })).toBe(5);
    expect(maxRunsPerDay({ MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "0" })).toBe(0);
    expect(maxRunsPerDay({ MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "-3" })).toBe(20);
    expect(maxRunsPerDay({ MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "lots" })).toBe(20);
  });
});

describe("run guards — enforcement", () => {
  it("refuses new runs while paused, and logs why", async () => {
    const { user, campaign } = await readyCampaign("paused");
    const events: Record<string, unknown>[] = [];
    const restore = captureEvents((e) => events.push(e));
    await expect(
      assertCampaignRunAllowed(prisma, { userId: user.id, campaignId: campaign.id }, { env: { LEAD_DISCOVERY_PAUSED: "true" } }),
    ).rejects.toThrow(LeadDiscoveryPausedError);
    restore();
    expect(events).toContainEqual(expect.objectContaining({ event: "lead_discovery.run_blocked", reason: "paused" }));
  });

  it("enforces the rolling daily cap per user, and 0 means unlimited", async () => {
    const { user, campaign } = await readyCampaign("cap");
    await prisma.campaignExecution.createMany({
      data: [
        { campaignId: campaign.id, status: "COMPLETED" },
        { campaignId: campaign.id, status: "FAILED" },
      ],
    });
    const input = { userId: user.id, campaignId: campaign.id };

    await expect(assertCampaignRunAllowed(prisma, input, { env: { MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "3" } })).resolves.toBeUndefined();
    const error = await assertCampaignRunAllowed(prisma, input, { env: { MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "2" } }).catch((e) => e);
    expect(error).toBeInstanceOf(DailyRunLimitError);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.httpStatus).toBe(429);
    await expect(assertCampaignRunAllowed(prisma, input, { env: { MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "0" } })).resolves.toBeUndefined();

    // Runs older than 24h don't count.
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    await expect(
      assertCampaignRunAllowed(prisma, input, { env: { MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "1" }, now: later }),
    ).resolves.toBeUndefined();
  });

  it("does not count another user's runs", async () => {
    const other = await readyCampaign("cap-other");
    await prisma.campaignExecution.create({ data: { campaignId: other.campaign.id, status: "COMPLETED" } });
    const { user, campaign } = await readyCampaign("cap-self");
    await expect(
      assertCampaignRunAllowed(prisma, { userId: user.id, campaignId: campaign.id }, { env: { MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "1" } }),
    ).resolves.toBeUndefined();
  });

  it("lets an idempotent replay through even when paused or over the cap", async () => {
    const { user, campaign } = await readyCampaign("replay");
    await prisma.campaignExecution.create({ data: { campaignId: campaign.id, status: "COMPLETED", idempotencyKey: "replay-key" } });
    const env = { LEAD_DISCOVERY_PAUSED: "true", MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY: "1" };
    await expect(
      assertCampaignRunAllowed(prisma, { userId: user.id, campaignId: campaign.id, idempotencyKey: "replay-key" }, { env }),
    ).resolves.toBeUndefined();
    await expect(
      assertCampaignRunAllowed(prisma, { userId: user.id, campaignId: campaign.id, idempotencyKey: "new-key" }, { env }),
    ).rejects.toThrow(LeadDiscoveryPausedError);
  });

  it("the run route applies the guards before any state changes", async () => {
    const { user, campaign } = await readyCampaign("route-paused");
    const session = await createSession(prisma, user.id);
    const request = new NextRequest(`http://localhost/api/campaigns/${campaign.id}/run`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session.token}` },
    });
    process.env.LEAD_DISCOVERY_PAUSED = "true";
    try {
      await expect(handleRunCampaign(prisma, request, { id: campaign.id })).rejects.toThrow(LeadDiscoveryPausedError);
    } finally {
      delete process.env.LEAD_DISCOVERY_PAUSED;
    }
    const current = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(current.status).toBe("READY");
    expect(await prisma.campaignExecution.count({ where: { campaignId: campaign.id } })).toBe(0);
  });
});

describe("POST /api/internal/jobs/expire-stale-runs", () => {
  it("rejects missing, malformed and wrong tokens, and fails closed without a configured secret", async () => {
    await expect(handleExpireStaleRuns(prisma, jobRequest(), JOB_SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleExpireStaleRuns(prisma, jobRequest(JOB_SECRET), JOB_SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleExpireStaleRuns(prisma, jobRequest("Bearer wrong-token-0123456789abcdef"), JOB_SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleExpireStaleRuns(prisma, jobRequest("Bearer short"), "short")).rejects.toThrow(UnauthenticatedError);
  });

  it("expires stale async runs, alerts-level logs them, and leaves fresh ones", async () => {
    const stale = await readyCampaign("job-stale");
    const fresh = await readyCampaign("job-fresh");
    const { execution: staleRun } = await runCampaign(prisma, stale.user.id, stale.campaign.id, { provider: acceptingProvider });
    const { execution: freshRun } = await runCampaign(prisma, fresh.user.id, fresh.campaign.id, { provider: acceptingProvider });
    await prisma.campaignExecution.update({ where: { id: staleRun.id }, data: { triggeredAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } });

    const events: Record<string, unknown>[] = [];
    const restore = captureEvents((e) => events.push(e));
    const response = await handleExpireStaleRuns(prisma, jobRequest(`Bearer ${JOB_SECRET}`), JOB_SECRET);
    restore();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.expired).toBeGreaterThanOrEqual(1);

    expect((await prisma.campaignExecution.findUniqueOrThrow({ where: { id: staleRun.id } })).status).toBe("FAILED");
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: stale.campaign.id } })).status).toBe("FAILED");
    expect((await prisma.campaignExecution.findUniqueOrThrow({ where: { id: freshRun.id } })).status).toBe("RUNNING");

    expect(events).toContainEqual(
      expect.objectContaining({ event: "lead_discovery.run_failed", executionId: staleRun.id, reason: "timeout", provider: "osm" }),
    );
    expect(events).toContainEqual(expect.objectContaining({ event: "lead_discovery.stale_runs_expired" }));
  });
});
