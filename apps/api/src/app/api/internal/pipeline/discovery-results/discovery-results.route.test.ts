import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../../../../../lib/db/client";
import { createTestUser, deleteTestUsers, uniqueBusinessName, uniqueIndianPhone } from "../../../../../lib/testing/db-test-helpers";
import { createCampaign, markCampaignReady } from "../../../../../lib/campaigns/campaign.service";
import { runCampaign } from "../../../../../lib/campaigns/run.service";
import type { AsyncLeadProvider } from "../../../../../lib/providers/async-provider";
import { NotFoundError, UnauthenticatedError, ValidationError } from "../../../../../lib/errors";
import { DISCOVERY_WORKER_FAILURE_MESSAGE, handleDiscoveryResults } from "./route";

const SECRET = "discovery-results-test-jobs-secret-01234567890";
const SOURCE = "osm:test";
const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  try {
    await prisma.business.deleteMany({ where: { source: SOURCE } });
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2003")) throw error;
  }
  await prisma.$disconnect();
});

const acceptingProvider: AsyncLeadProvider = { name: "osm", trigger: async () => ({ externalRunId: null }) };

async function runningExecution(prefix: string, leadLimit = 10) {
  const user = await createTestUser(`discovery-${prefix}`);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, {
    name: "discovery test",
    location: "Chennai",
    category: "Cafe",
    websiteRequirement: "WITHOUT_WEBSITE",
    leadLimit,
  });
  await markCampaignReady(prisma, user.id, campaign.id);
  const { execution } = await runCampaign(prisma, user.id, campaign.id, { provider: acceptingProvider });
  return { user, campaign, execution };
}

function business(tag: string, overrides: Record<string, unknown> = {}) {
  return {
    name: uniqueBusinessName(`Cafe ${tag}`),
    category: "Cafe",
    city: "Chennai",
    phone: uniqueIndianPhone(),
    website: null,
    rating: 4.5,
    reviewCount: 120,
    source: SOURCE,
    externalId: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

function req(body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers.authorization = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/internal/pipeline/discovery-results", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/internal/pipeline/discovery-results — authentication", () => {
  it("rejects a missing or wrong bearer token", async () => {
    const { execution } = await runningExecution("auth");
    await expect(handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [] }, null), SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [] }, "wrong-secret-0123456789012345"), SECRET)).rejects.toThrow(UnauthenticatedError);
  });
});

describe("POST /api/internal/pipeline/discovery-results — success", () => {
  it("ingests the delivered businesses (through the Phase 2 dedup cascade) and completes the run", async () => {
    const { execution } = await runningExecution("success");
    const response = await handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [business("a"), business("b")] }, SECRET), SECRET);
    const body = await response.json();

    expect(body).toMatchObject({ ok: true, duplicate: false, status: "COMPLETED" });

    const updated = await prisma.campaignExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.businessesFound).toBe(2);
    expect(updated.leadsCreated).toBe(2);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: execution.campaignId } });
    expect(campaign.status).toBe("COMPLETED");
  });

  it("caps leads at the campaign's leadLimit", async () => {
    const { execution } = await runningExecution("limit", 1);
    const response = await handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [business("l1"), business("l2")] }, SECRET), SECRET);
    const body = await response.json();
    expect(body.status).toBe("COMPLETED");

    const updated = await prisma.campaignExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.leadsCreated).toBe(1);
  });

  it("is idempotent: a second delivery for an already-finished execution is a no-op, not an error", async () => {
    const { execution } = await runningExecution("replay");
    await handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [business("r1")] }, SECRET), SECRET);

    const replay = await handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [business("r2")] }, SECRET), SECRET);
    const replayBody = await replay.json();
    expect(replayBody.duplicate).toBe(true);

    // The second (ignored) delivery's business must not have been ingested.
    const updated = await prisma.campaignExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.leadsCreated).toBe(1);
  });

  it("throws NotFoundError for an unknown executionId", async () => {
    await expect(handleDiscoveryResults(prisma, req({ executionId: "does-not-exist", businesses: [] }, SECRET), SECRET)).rejects.toThrow(NotFoundError);
  });
});

describe("POST /api/internal/pipeline/discovery-results — failure", () => {
  it("finalizes the execution as FAILED with a fixed, sanitized reason", async () => {
    const { execution } = await runningExecution("failure");
    const response = await handleDiscoveryResults(prisma, req({ executionId: execution.id, error: "Overpass API returned 504" }, SECRET), SECRET);
    const body = await response.json();
    expect(body.status).toBe("FAILED");

    const updated = await prisma.campaignExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.status).toBe("FAILED");
    // The raw worker error ("Overpass API returned 504") is logged
    // server-side only — the persisted message is always the fixed string.
    expect(updated.errorMessage).toBe(DISCOVERY_WORKER_FAILURE_MESSAGE);
  });
});

describe("POST /api/internal/pipeline/discovery-results — validation", () => {
  it("rejects a body with neither businesses nor error", async () => {
    const { execution } = await runningExecution("neither");
    await expect(handleDiscoveryResults(prisma, req({ executionId: execution.id }, SECRET), SECRET)).rejects.toThrow(ValidationError);
  });

  it("rejects a body with both businesses and error", async () => {
    const { execution } = await runningExecution("both");
    await expect(handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [], error: "x" }, SECRET), SECRET)).rejects.toThrow(ValidationError);
  });

  it("rejects an unexpected field", async () => {
    const { execution } = await runningExecution("strict");
    await expect(handleDiscoveryResults(prisma, req({ executionId: execution.id, businesses: [], extra: true }, SECRET), SECRET)).rejects.toThrow(ZodError);
  });
});
