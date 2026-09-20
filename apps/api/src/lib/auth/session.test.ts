import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { createSession, deleteSessionByToken, verifySessionToken } from "./session";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

describe("createSession / verifySessionToken", () => {
  it("resolves a freshly created session token back to its user", async () => {
    const user = await createTestUser("session");
    createdUserIds.push(user.id);

    const session = await createSession(prisma, user.id);
    const resolved = await verifySessionToken(prisma, session.token);

    expect(resolved?.id).toBe(user.id);
  });

  it("returns null for an unknown token", async () => {
    const resolved = await verifySessionToken(prisma, "not-a-real-token");
    expect(resolved).toBeNull();
  });

  it("returns null after the token's session is expired, and cleans it up", async () => {
    const user = await createTestUser("session-expired");
    createdUserIds.push(user.id);

    const session = await createSession(prisma, user.id);
    // Force the session into the past directly (verifySessionToken has no
    // "expire early" hook by design — expiry is a real timestamp check).
    const tokenHash = await import("node:crypto").then((c) => c.createHash("sha256").update(session.token).digest("hex"));
    await prisma.session.updateMany({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const resolved = await verifySessionToken(prisma, session.token);
    expect(resolved).toBeNull();

    const remaining = await prisma.session.findUnique({ where: { tokenHash } });
    expect(remaining).toBeNull();
  });

  it("deleteSessionByToken invalidates the session (logout)", async () => {
    const user = await createTestUser("session-logout");
    createdUserIds.push(user.id);

    const session = await createSession(prisma, user.id);
    await deleteSessionByToken(prisma, session.token);

    const resolved = await verifySessionToken(prisma, session.token);
    expect(resolved).toBeNull();
  });
});
