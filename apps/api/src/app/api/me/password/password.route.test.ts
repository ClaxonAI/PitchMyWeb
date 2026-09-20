import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../../lib/auth/session";
import { verifyPassword } from "../../../../lib/auth/password";
import { UnauthenticatedError, ValidationError } from "../../../../lib/errors";
import { handleChangePassword } from "./route";

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
    method: init.method ?? "POST",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

// createTestUser (db-test-helpers.ts) always seeds "Test1234!Strong" as the
// current password.
const CURRENT_PASSWORD = "Test1234!Strong";

describe("POST /api/me/password", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(
      handleChangePassword(prisma, req("http://localhost/api/me/password", { body: { currentPassword: CURRENT_PASSWORD, newPassword: "NewPassword1!" } })),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects the wrong current password without mutating the stored hash", async () => {
    const { user, cookieHeader } = await authedUser("wrong-current");
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    await expect(
      handleChangePassword(prisma, req("http://localhost/api/me/password", { body: { currentPassword: "totally-wrong", newPassword: "NewPassword1!" }, cookieHeader })),
    ).rejects.toThrow(ValidationError);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const { cookieHeader } = await authedUser("too-short");
    await expect(
      handleChangePassword(prisma, req("http://localhost/api/me/password", { body: { currentPassword: CURRENT_PASSWORD, newPassword: "short" }, cookieHeader })),
    ).rejects.toThrow(ZodError);
  });

  it("updates the password hash on success, verifiable with the new password", async () => {
    const { user, cookieHeader } = await authedUser("change-ok");
    const response = await handleChangePassword(
      prisma,
      req("http://localhost/api/me/password", { body: { currentPassword: CURRENT_PASSWORD, newPassword: "BrandNewPassword1!" }, cookieHeader }),
    );
    expect((await response.json()).success).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!updated.passwordHash) throw new Error("Expected the password hash to be stored");
    expect(await verifyPassword("BrandNewPassword1!", updated.passwordHash)).toBe(true);
    expect(await verifyPassword(CURRENT_PASSWORD, updated.passwordHash)).toBe(false);
  });
});
