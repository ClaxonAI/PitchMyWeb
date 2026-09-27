import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../db/client";
import { InvalidResetCodeError } from "../errors";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { MAX_ATTEMPTS, completePasswordReset, createResetCode, verifyResetCode } from "./password-reset";
import { createSession, verifySessionToken } from "./session";
import { verifyPassword } from "./password";
import { handlePasswordResetRequest } from "../../app/api/auth/password-reset/request/route";
import { handlePasswordResetVerify } from "../../app/api/auth/password-reset/verify/route";
import { handlePasswordResetComplete } from "../../app/api/auth/password-reset/complete/route";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

async function user() {
  const created = await createTestUser("reset");
  createdUserIds.push(created.id);
  return created;
}

async function issued(email: string) {
  const result = await createResetCode(prisma, email);
  if (result.status !== "sent") throw new Error(`expected a code, got ${result.status}`);
  return result.code;
}

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) });

describe("password reset by emailed code", () => {
  it("resets the password with the right code, ends every session and works once", async () => {
    const { id, email } = await user();
    const old = await createSession(prisma, id);
    const code = await issued(email);

    const { resetToken } = await verifyResetCode(prisma, email, code);
    const updated = await completePasswordReset(prisma, resetToken, "BrandNew!Pass9");

    expect(await verifyPassword("BrandNew!Pass9", updated.passwordHash!)).toBe(true);
    expect(await verifySessionToken(prisma, old.token)).toBeNull();
    await expect(completePasswordReset(prisma, resetToken, "Another!Pass9")).rejects.toBeInstanceOf(InvalidResetCodeError);
    await expect(verifyResetCode(prisma, email, code)).rejects.toBeInstanceOf(InvalidResetCodeError);
  });

  it(`kills a code after ${MAX_ATTEMPTS} wrong guesses, even if the right one comes next`, async () => {
    const { email } = await user();
    const code = await issued(email);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await expect(verifyResetCode(prisma, email, wrong(code))).rejects.toBeInstanceOf(InvalidResetCodeError);
    }
    await expect(verifyResetCode(prisma, email, code)).rejects.toBeInstanceOf(InvalidResetCodeError);
  });

  it("refuses an expired code", async () => {
    const { email } = await user();
    const code = await issued(email);
    await expect(verifyResetCode(prisma, email, code, new Date(Date.now() + 11 * 60 * 1000))).rejects.toBeInstanceOf(InvalidResetCodeError);
  });

  it("refuses an expired reset token", async () => {
    const { email } = await user();
    const { resetToken } = await verifyResetCode(prisma, email, await issued(email));
    await expect(completePasswordReset(prisma, resetToken, "BrandNew!Pass9", new Date(Date.now() + 16 * 60 * 1000))).rejects.toBeInstanceOf(InvalidResetCodeError);
  });

  it("sends at most one code a minute, and a new code replaces the old one", async () => {
    const { id, email } = await user();
    const first = await issued(email);
    expect((await createResetCode(prisma, email)).status).toBe("cooldown");

    await prisma.passwordResetCode.updateMany({ where: { userId: id }, data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) } });
    const second = await issued(email);
    if (first !== second) await expect(verifyResetCode(prisma, email, first)).rejects.toBeInstanceOf(InvalidResetCodeError);
    await expect(verifyResetCode(prisma, email, second)).resolves.toHaveProperty("resetToken");
  });

  it("makes no code for an unknown or suspended account", async () => {
    expect((await createResetCode(prisma, `nobody-${Date.now()}@example.test`)).status).toBe("no_account");
    const { id, email } = await user();
    await prisma.user.update({ where: { id }, data: { suspendedAt: new Date() } });
    expect((await createResetCode(prisma, email)).status).toBe("suspended");
  });
});

describe("password reset routes", () => {
  it("answers the same for a real and an unknown address, and only emails the real one", async () => {
    const { email } = await user();
    const sent: string[] = [];
    const defer = (task: () => Promise<unknown>) => void sent.push(String(task));

    const known = await handlePasswordResetRequest(prisma, post("/api/auth/password-reset/request", { email }), defer);
    const unknown = await handlePasswordResetRequest(prisma, post("/api/auth/password-reset/request", { email: `nobody-${Date.now()}@example.test` }), defer);
    expect(known.status).toBe(200);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sent).toHaveLength(1);
  });

  it("verifies, completes and signs the browser in", async () => {
    const { email } = await user();
    const code = await issued(email);
    const verify = await handlePasswordResetVerify(prisma, post("/api/auth/password-reset/verify", { email, code }));
    const { resetToken } = await verify.json();

    const done = await handlePasswordResetComplete(prisma, post("/api/auth/password-reset/complete", { resetToken, password: "BrandNew!Pass9" }), () => {});
    expect(done.status).toBe(200);
    expect(done.cookies.get("pmw_session")?.value).toBeTruthy();
  });
});
