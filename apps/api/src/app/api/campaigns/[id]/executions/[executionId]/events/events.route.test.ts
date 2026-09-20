import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../../../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../../../../../lib/auth/session";
import { UnauthenticatedError, NotFoundError } from "../../../../../../../lib/errors";
import { handleDiscoveryEvents } from "./route";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const session = await createSession(prisma, user.id);
  return { user, cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` };
}

function req(cookieHeader?: string) {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest("http://localhost/api/campaigns/x/executions/y/events", { headers });
}

describe("GET /api/campaigns/:id/executions/:executionId/events", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(
      handleDiscoveryEvents(prisma, req(), { id: "clxxxxxxxxxxxxxxxxxxxxxx", executionId: "clyyyyyyyyyyyyyyyyyyyyyy" }),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("404s when the campaign belongs to someone else", async () => {
    const owner = await authedUser("disc-events-owner");
    const stranger = await authedUser("disc-events-stranger");
    const campaign = await prisma.campaign.create({
      data: { userId: owner.user.id, name: "Owner campaign", location: "Chennai", category: "Dental Clinic", leadLimit: 10 },
    });
    const execution = await prisma.campaignExecution.create({
      data: { campaignId: campaign.id, status: "RUNNING", provider: "osm" },
    });

    await expect(
      handleDiscoveryEvents(prisma, req(stranger.cookieHeader), { id: campaign.id, executionId: execution.id }),
    ).rejects.toThrow(NotFoundError);
  });
});
