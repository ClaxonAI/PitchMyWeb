import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { deleteTestUsers, uniqueEmail } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/session";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  createOauthState,
  hashOauthState,
  upsertGoogleUser,
} from "../../../lib/auth/google";
import { handleGoogleCallback } from "./google/callback/route";
import { handleRegister } from "./register/route";
import { AccountSuspendedError } from "../../../lib/errors";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upsertGoogleUser", () => {
  it("creates a Google-only user when the email is new", async () => {
    const email = uniqueEmail("google-new");
    const user = await upsertGoogleUser(prisma, {
      sub: `google-sub-${email}`,
      email,
      emailVerified: true,
      name: "Google User",
      picture: "https://example.com/a.png",
    });
    createdUserIds.push(user.id);
    expect(user.email).toBe(email);
    expect(user.googleId).toBe(`google-sub-${email}`);
    expect(user.passwordHash).toBeNull();
    expect(user.name).toBe("Google User");
  });

  it("links Google to an existing email/password account", async () => {
    const email = uniqueEmail("google-link");
    const reg = await handleRegister(
      prisma,
      new NextRequest("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.1" },
        body: JSON.stringify({ email, password: "correcthorsebattery" }),
      }),
    );
    const { id } = await reg.json();
    createdUserIds.push(id);

    const linked = await upsertGoogleUser(prisma, {
      sub: `google-sub-${email}`,
      email,
      emailVerified: true,
      name: "Linked Name",
    });
    expect(linked.id).toBe(id);
    expect(linked.googleId).toBe(`google-sub-${email}`);
    expect(linked.passwordHash).toBeTruthy();
  });

  it("refuses a suspended account", async () => {
    const email = uniqueEmail("google-sus");
    const user = await upsertGoogleUser(prisma, {
      sub: `google-sub-${email}`,
      email,
      emailVerified: true,
    });
    createdUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: new Date() } });

    await expect(
      upsertGoogleUser(prisma, { sub: `google-sub-${email}`, email, emailVerified: true }),
    ).rejects.toThrow(AccountSuspendedError);
  });
});

describe("handleGoogleCallback", () => {
  it("sets a session cookie after a valid code + state", async () => {
    const email = uniqueEmail("google-cb");
    const { raw, hash } = createOauthState();
    expect(hashOauthState(raw)).toBe(hash);

    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    vi.stubEnv("APP_URL", "http://localhost:3000");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ access_token: "atok" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
          return new Response(
            JSON.stringify({
              sub: `google-sub-${email}`,
              email,
              email_verified: true,
              name: "Callback User",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const request = new NextRequest(
      `http://localhost/api/auth/google/callback?code=fake-code&state=${encodeURIComponent(raw)}`,
      {
        headers: {
          cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${hash}`,
          "x-forwarded-for": "10.9.9.2",
        },
      },
    );

    const response = await handleGoogleCallback(prisma, request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(stored.id);
    expect(stored.googleId).toBe(`google-sub-${email}`);
  });
});
