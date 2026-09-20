import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../../lib/auth/session";
import { UnauthenticatedError } from "../../../../lib/errors";
import { handleParseCampaignQuery } from "./route";
import type { CampaignQueryParser } from "../../../../lib/ai/campaign-query-parser";

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

function req(init: { body?: unknown; cookieHeader?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.cookieHeader) headers.cookie = init.cookieHeader;
  return new NextRequest("http://localhost/api/campaigns/parse-query", {
    method: "POST",
    headers,
    body: JSON.stringify(init.body ?? { query: "dentists in Chennai without a website" }),
  });
}

describe("POST /api/campaigns/parse-query", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleParseCampaignQuery(prisma, req(), null)).rejects.toThrow(UnauthenticatedError);
  });

  it("returns not_configured when no parser is available", async () => {
    const { cookieHeader } = await authedUser("parse-unconfigured");
    const response = await handleParseCampaignQuery(prisma, req({ cookieHeader }), null);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ parsed: null, reason: "not_configured" });
  });

  it("returns parsed fields on success", async () => {
    const { cookieHeader } = await authedUser("parse-ok");
    const parser: CampaignQueryParser = {
      parse: async () => ({ category: "Dental Clinic", location: "Chennai" }),
    };
    const response = await handleParseCampaignQuery(prisma, req({ cookieHeader }), parser);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ parsed: { category: "Dental Clinic", location: "Chennai" } });
  });

  it("returns parse_failed when the parser yields nothing", async () => {
    const { cookieHeader } = await authedUser("parse-fail");
    const parser: CampaignQueryParser = { parse: async () => null };
    const response = await handleParseCampaignQuery(prisma, req({ cookieHeader }), parser);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ parsed: null, reason: "parse_failed" });
  });
});
