import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError } from "../../../lib/errors";
import { handleGetSettings } from "./route";

const createdUserIds: string[] = [];
const TEST_KEY_PREFIX = "settings-route-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.settings.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
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
  return new NextRequest("http://localhost/api/settings", { method: "GET", headers });
}

describe("GET /api/settings", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleGetSettings(prisma, req())).rejects.toThrow(UnauthenticatedError);
  });

  it("returns configurable service/pricing information for an authenticated user", async () => {
    const { cookieHeader } = await authedUser("shape");
    const response = await handleGetSettings(prisma, req(cookieHeader));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body.services)).toBe(true);
    expect(body.services.length).toBeGreaterThan(0);
    for (const service of body.services) {
      expect(typeof service.code).toBe("string");
      expect(typeof service.priceMin).toBe("number");
      expect(typeof service.priceMax).toBe("number");
      expect(service.active).toBe(true);
    }
    expect(Array.isArray(body.settings)).toBe(true);
  });

  it("never exposes passwords, session data, or API-key-shaped values", async () => {
    const { cookieHeader } = await authedUser("no-secrets");
    await prisma.settings.create({ data: { key: `${TEST_KEY_PREFIX}some_webhook_secret`, value: "sh-should-never-appear" } });

    const response = await handleGetSettings(prisma, req(cookieHeader));
    const body = await response.json();
    const raw = JSON.stringify(body);

    // No raw secret-shaped Settings key/value made it into the payload...
    expect(raw).not.toContain("sh-should-never-appear");
    // ...and no field anywhere in the response carries a credential.
    expect(raw.toLowerCase()).not.toContain("passwordhash");
    expect(raw.toLowerCase()).not.toContain("tokenhash");
    expect(body.services.every((s: Record<string, unknown>) => !("passwordHash" in s))).toBe(true);
  });

  it("does not scope results by caller (global configuration, same catalog for every authenticated user)", async () => {
    const { cookieHeader: cookieA } = await authedUser("scope-a");
    const { cookieHeader: cookieB } = await authedUser("scope-b");

    const responseA = await handleGetSettings(prisma, req(cookieA));
    const responseB = await handleGetSettings(prisma, req(cookieB));
    const bodyA = await responseA.json();
    const bodyB = await responseB.json();

    expect(bodyA.services.map((s: { code: string }) => s.code).sort()).toEqual(bodyB.services.map((s: { code: string }) => s.code).sort());
  });
});
