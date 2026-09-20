import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../../../lib/testing/db-test-helpers";
import { createCampaign, markCampaignReady } from "../../../../../lib/campaigns/campaign.service";
import { finalizeExecution, runCampaign, totalsFromExecution } from "../../../../../lib/campaigns/run.service";
import type { AsyncLeadProvider } from "../../../../../lib/providers/async-provider";
import { ConflictError, NotFoundError, UnauthenticatedError } from "../../../../../lib/errors";
import { handleGetDiscoveryJob } from "./[executionId]/route";

const SECRET = "discovery-jobs-test-jobs-secret-01234567890";
const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

const acceptingProvider: AsyncLeadProvider = { name: "osm", trigger: async () => ({ externalRunId: null }) };

async function runningExecution(prefix: string) {
  const user = await createTestUser(`discovery-jobs-${prefix}`);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, {
    name: "discovery jobs test",
    location: "Chennai",
    category: "Cafe",
    radius: 5,
    minRating: 4,
    minReviews: 10,
    websiteRequirement: "WITHOUT_WEBSITE",
    leadLimit: 15,
  });
  await markCampaignReady(prisma, user.id, campaign.id);
  const { execution } = await runCampaign(prisma, user.id, campaign.id, { provider: acceptingProvider });
  return { user, campaign, execution };
}

function req(secret: string | null = SECRET) {
  const headers: Record<string, string> = {};
  if (secret !== null) headers.authorization = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/internal/pipeline/discovery-jobs/x", { headers });
}

describe("GET /api/internal/pipeline/discovery-jobs/:executionId", () => {
  it("rejects a missing or wrong bearer token", async () => {
    const { execution } = await runningExecution("auth");
    await expect(handleGetDiscoveryJob(prisma, req(null), { executionId: execution.id }, SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleGetDiscoveryJob(prisma, req("wrong-secret-0123456789012345"), { executionId: execution.id }, SECRET)).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the campaign's search params for a RUNNING execution", async () => {
    const { campaign, execution } = await runningExecution("success");
    const response = await handleGetDiscoveryJob(prisma, req(), { executionId: execution.id }, SECRET);
    const body = await response.json();

    expect(body).toEqual({
      executionId: execution.id,
      location: campaign.location,
      category: campaign.category,
      radius: campaign.radius,
      minRating: campaign.minRating,
      minReviews: campaign.minReviews,
      leadLimit: campaign.leadLimit,
    });
  });

  it("throws NotFoundError for an unknown executionId", async () => {
    await expect(handleGetDiscoveryJob(prisma, req(), { executionId: "does-not-exist" }, SECRET)).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError once the execution is no longer RUNNING", async () => {
    const { execution } = await runningExecution("finished");
    await finalizeExecution(prisma, { id: execution.campaignId, status: "PROCESSING" }, execution.id, totalsFromExecution(execution), null);
    await expect(handleGetDiscoveryJob(prisma, req(), { executionId: execution.id }, SECRET)).rejects.toThrow(ConflictError);
  });
});
