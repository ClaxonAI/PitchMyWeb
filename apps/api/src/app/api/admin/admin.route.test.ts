import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { ForbiddenError, UnauthenticatedError } from "../../../lib/errors";
import { handleAdminOverview } from "./overview/route";
import { handleAdminListUsers } from "./users/route";
import { handleAdminSuspendUser } from "./users/[id]/suspend/route";
import { handleAdminRestoreUser } from "./users/[id]/restore/route";
import { handleAdminSetUserPlan } from "./users/[id]/plan/route";
import { handleGetMe } from "../me/route";

const createdUserIds: string[] = [];
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

async function authed(prefix: string, role: "USER" | "ADMIN" | "SUPER_ADMIN" = "ADMIN") {
  const user = await createTestUser(prefix, { role });
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

describe("GET /api/admin/overview", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleAdminOverview(prisma, req("http://localhost/api/admin/overview"))).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects a customer session", async () => {
    const { cookieHeader } = await authed("overview-user", "USER");
    await expect(handleAdminOverview(prisma, req("http://localhost/api/admin/overview", { cookieHeader }))).rejects.toThrow(ForbiddenError);
  });

  it("returns platform counts for an admin", async () => {
    const { cookieHeader } = await authed("overview-admin");
    const response = await handleAdminOverview(prisma, req("http://localhost/api/admin/overview", { cookieHeader }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.users).toBe("number");
    expect(typeof body.pendingDuplicates).toBe("number");
  });
});

describe("admin user management", () => {
  it("lists users", async () => {
    const { cookieHeader, user } = await authed("list-admin");
    const response = await handleAdminListUsers(prisma, req("http://localhost/api/admin/users?pageSize=100", { cookieHeader }));
    const body = await response.json();
    expect(body.items.some((item: { id: string }) => item.id === user.id)).toBe(true);
  });

  it("suspends a user, blocks /api/me, then restores them", async () => {
    const { cookieHeader } = await authed("suspend-admin");
    const target = await createTestUser("suspend-target");
    createdUserIds.push(target.id);
    const targetSession = await createSession(prisma, target.id);

    const suspend = await handleAdminSuspendUser(prisma, req(`http://localhost/api/admin/users/${target.id}/suspend`, { method: "POST", cookieHeader }), {
      id: target.id,
    });
    expect(suspend.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);

    await expect(handleGetMe(prisma, req("http://localhost/api/me", { cookieHeader: `${SESSION_COOKIE_NAME}=${targetSession.token}` }))).rejects.toThrow();

    const restore = await handleAdminRestoreUser(prisma, req(`http://localhost/api/admin/users/${target.id}/restore`, { method: "POST", cookieHeader }), {
      id: target.id,
    });
    expect(restore.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).toBeNull();
  });

  it("assigns a plan without creating a Razorpay order", async () => {
    const { cookieHeader } = await authed("plan-admin");
    const target = await createTestUser("plan-target");
    createdUserIds.push(target.id);

    const response = await handleAdminSetUserPlan(
      prisma,
      req(`http://localhost/api/admin/users/${target.id}/plan`, { method: "PATCH", body: { planId: "direct" }, cookieHeader }),
      { id: target.id },
    );
    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).planId).toBe("direct");
  });

  it("refuses to suspend the caller", async () => {
    const { cookieHeader, user } = await authed("self-admin");
    await expect(
      handleAdminSuspendUser(prisma, req(`http://localhost/api/admin/users/${user.id}/suspend`, { method: "POST", cookieHeader }), { id: user.id }),
    ).rejects.toThrow(ForbiddenError);
  });
});
