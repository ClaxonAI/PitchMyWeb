import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError } from "../../../lib/errors";
import { handleGetMe, handlePatchMe } from "./route";

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

function req(url: string, init: { method?: string; body?: unknown; cookieHeader?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.cookieHeader) headers.cookie = init.cookieHeader;
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe("GET /api/me", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleGetMe(prisma, req("http://localhost/api/me"))).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the caller's own id/email/name", async () => {
    const { user, cookieHeader } = await authedUser("get-me");
    const response = await handleGetMe(prisma, req("http://localhost/api/me", { cookieHeader }));
    const body = await response.json();
    expect(body).toEqual({
      allowedMarkets: ["india", "foreign"],
      id: user.id,
      email: user.email,
      name: null,
      role: "USER",
      planId: null,
      hasPaidAccess: true,
      canDiscover: true,
      // The wallet is ensured (and the one-time free grant applied) on
      // every /api/me read, gated or not. These are the only pitch numbers
      // the API reports now: the derived freePitches* fields are gone, and
      // with them the "paid means unlimited" state they encoded.
      availableCredits: 10,
      reservedCredits: 0,
      usedCredits: 0,
      // No WhatsApp linked yet, so the dashboard asks for one before a campaign.
      whatsappConnected: false,
    });

    await prisma.whatsAppAccount.create({ data: { userId: user.id, status: "CONNECTED" } });
    const after = await (await handleGetMe(prisma, req("http://localhost/api/me", { cookieHeader }))).json();
    expect(after.whatsappConnected).toBe(true);
  });
});

describe("PATCH /api/me", () => {
  it("updates the caller's own name and GET reflects it", async () => {
    const { cookieHeader } = await authedUser("patch-me");
    const patchResponse = await handlePatchMe(prisma, req("http://localhost/api/me", { method: "PATCH", body: { name: "Ada Lovelace" }, cookieHeader }));
    expect((await patchResponse.json()).name).toBe("Ada Lovelace");

    const getResponse = await handleGetMe(prisma, req("http://localhost/api/me", { cookieHeader }));
    expect((await getResponse.json()).name).toBe("Ada Lovelace");
  });

  it("accepts null to clear the name", async () => {
    const { cookieHeader } = await authedUser("patch-me-clear");
    await handlePatchMe(prisma, req("http://localhost/api/me", { method: "PATCH", body: { name: "Temp" }, cookieHeader }));
    const response = await handlePatchMe(prisma, req("http://localhost/api/me", { method: "PATCH", body: { name: null }, cookieHeader }));
    expect((await response.json()).name).toBeNull();
  });

  it("rejects a body with an unexpected field", async () => {
    const { cookieHeader } = await authedUser("patch-me-strict");
    await expect(handlePatchMe(prisma, req("http://localhost/api/me", { method: "PATCH", body: { name: "X", email: "new@example.test" }, cookieHeader }))).rejects.toThrow(ZodError);
  });
});
