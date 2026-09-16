import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { prisma } from "../../../lib/db/client";
import { deleteTestUsers, uniqueEmail } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/session";
import * as passwordModule from "../../../lib/auth/password";
import { handleRegister } from "./register/route";
import { handleLogin } from "./login/route";
import { handleLogout } from "./logout/route";
import { ConflictError, RateLimitedError, UnauthenticatedError } from "../../../lib/errors";
import { ZodError } from "zod";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

// Every call gets its own x-forwarded-for by default so ordinary functional
// tests never share a rate-limit bucket with each other (the dedicated
// "rate limiting" suite below deliberately reuses one IP/email instead).
let ipSeq = 0;
function jsonRequest(url: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  ipSeq += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${ipSeq}`, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function readSetCookieToken(response: NextResponse): string | undefined {
  return response.cookies.get(SESSION_COOKIE_NAME)?.value;
}

describe("handleRegister", () => {
  it("creates a user, hashes the password, and sets a session cookie", async () => {
    const email = uniqueEmail("register");
    const response = await handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email, password: "correcthorsebattery" }));
    expect(response.status).toBe(201);

    const body = await response.json();
    createdUserIds.push(body.id);
    expect(body.email).toBe(email);
    expect(body).not.toHaveProperty("passwordHash");

    const token = readSetCookieToken(response);
    expect(token).toBeTruthy();

    const stored = await prisma.user.findUnique({ where: { id: body.id } });
    expect(stored?.passwordHash).not.toBe("correcthorsebattery");
  });

  it("rejects a duplicate email with ConflictError (route maps this to 409)", async () => {
    const email = uniqueEmail("register-dup");
    const first = await handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email, password: "correcthorsebattery" }));
    createdUserIds.push((await first.json()).id);

    await expect(handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email, password: "another-password" }))).rejects.toThrow(ConflictError);
  });

  it("rejects invalid input with a ZodError (route maps this to 400)", async () => {
    await expect(handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email: "not-an-email", password: "short" }))).rejects.toThrow(ZodError);
  });
});

describe("handleLogin", () => {
  it("logs in with correct credentials and sets a session cookie", async () => {
    const email = uniqueEmail("login");
    const registerResponse = await handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email, password: "correcthorsebattery" }));
    createdUserIds.push((await registerResponse.json()).id);

    const loginResponse = await handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email, password: "correcthorsebattery" }));
    expect(loginResponse.status).toBe(200);
    expect(readSetCookieToken(loginResponse)).toBeTruthy();
  });

  it("rejects a wrong password with UnauthenticatedError, the same as a nonexistent account (no user enumeration)", async () => {
    const email = uniqueEmail("login-wrong");
    const registerResponse = await handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email, password: "correcthorsebattery" }));
    createdUserIds.push((await registerResponse.json()).id);

    await expect(handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email, password: "wrong-password" }))).rejects.toThrow(UnauthenticatedError);
    await expect(handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email: uniqueEmail("never-registered"), password: "wrong-password" }))).rejects.toThrow(UnauthenticatedError);
  });

  // Phase 4 code-review finding #2 fix verification. Per the fix's own
  // instructions: don't try to prove exact timing equality in a unit test
  // (flaky by nature) — instead assert the *control flow* deterministically:
  // verifyPassword must be invoked even when no user exists, which is what
  // actually equalizes the cost paid on both paths.
  it("still performs password verification for a nonexistent email (equalizes timing with a real wrong-password attempt)", async () => {
    const verifySpy = vi.spyOn(passwordModule, "verifyPassword");
    try {
      await expect(
        handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email: uniqueEmail("timing-check"), password: "whatever" })),
      ).rejects.toThrow(UnauthenticatedError);

      expect(verifySpy).toHaveBeenCalledTimes(1);
      // Verified against the fixed dummy hash, never against `undefined`/a
      // short-circuited literal — this is what proves bcrypt.compare()
      // actually ran instead of the call being skipped for a missing user.
      expect(verifySpy).toHaveBeenCalledWith("whatever", passwordModule.DUMMY_PASSWORD_HASH);
    } finally {
      verifySpy.mockRestore();
    }
  });

  it("verifies against the real user's hash (not the dummy) when the account exists", async () => {
    const email = uniqueEmail("timing-check-real");
    const registerResponse = await handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email, password: "correcthorsebattery" }));
    createdUserIds.push((await registerResponse.json()).id);
    const stored = await prisma.user.findUnique({ where: { email } });

    const verifySpy = vi.spyOn(passwordModule, "verifyPassword");
    try {
      await expect(handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email, password: "wrong-password" }))).rejects.toThrow(UnauthenticatedError);
      expect(verifySpy).toHaveBeenCalledWith("wrong-password", stored?.passwordHash);
    } finally {
      verifySpy.mockRestore();
    }
  });
});

describe("rate limiting", () => {
  it("locks out further login attempts against the same email after the limit, regardless of IP", async () => {
    const email = uniqueEmail("rate-limit-login-email");
    // All 11 requests target the same email but each gets its own IP (via
    // jsonRequest's per-call counter) so only the per-email bucket, not the
    // per-IP bucket, is what trips here.
    for (let i = 0; i < 10; i += 1) {
      await expect(handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email, password: "guess" }))).rejects.toThrow(UnauthenticatedError);
    }
    await expect(handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email, password: "guess" }))).rejects.toThrow(RateLimitedError);
  }, 20000);

  it("locks out further login attempts from the same IP after the limit, regardless of email", async () => {
    // 20 sequential bcrypt.compare() calls (~150-300ms each) comfortably
    // exceed vitest's 5s default test timeout; this isn't slow because
    // anything is wrong, it's slow because bcrypt is deliberately expensive.
    // The 45s (not 20s) margin accounts for running as part of the full
    // suite, where several other files' bcrypt-heavy tests compete for the
    // same CPU cores concurrently — this test passes in well under 20s in
    // isolation; the wider budget is purely for full-suite scheduling
    // contention, not a change to what's being verified.
    const fixedHeaders = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 20; i += 1) {
      await expect(
        handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email: uniqueEmail(`rate-limit-login-ip-${i}`), password: "guess" }, fixedHeaders)),
      ).rejects.toThrow(UnauthenticatedError);
    }
    await expect(
      handleLogin(prisma, jsonRequest("http://localhost/api/auth/login", { email: uniqueEmail("rate-limit-login-ip-last"), password: "guess" }, fixedHeaders)),
    ).rejects.toThrow(RateLimitedError);
  }, 45000);

  it("locks out further registrations from the same IP after the limit", async () => {
    const fixedHeaders = { "x-forwarded-for": "203.0.113.10" };
    for (let i = 0; i < 10; i += 1) {
      const response = await handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email: uniqueEmail(`rate-limit-register-${i}`), password: "correcthorsebattery" }, fixedHeaders));
      createdUserIds.push((await response.json()).id);
    }
    await expect(
      handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email: uniqueEmail("rate-limit-register-last"), password: "correcthorsebattery" }, fixedHeaders)),
    ).rejects.toThrow(RateLimitedError);
  }, 20000);
});

describe("handleLogout", () => {
  it("invalidates the session so the cookie can no longer authenticate", async () => {
    const email = uniqueEmail("logout");
    const registerResponse = await handleRegister(prisma, jsonRequest("http://localhost/api/auth/register", { email, password: "correcthorsebattery" }));
    createdUserIds.push((await registerResponse.json()).id);
    const token = readSetCookieToken(registerResponse)!;

    const logoutRequest = new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    const logoutResponse = await handleLogout(prisma, logoutRequest);
    expect(logoutResponse.status).toBe(200);

    const { verifySessionToken } = await import("../../../lib/auth/session");
    const resolved = await verifySessionToken(prisma, token);
    expect(resolved).toBeNull();
  });
});
