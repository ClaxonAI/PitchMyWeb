import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../db/client";
import { NotFoundError } from "../errors";
import { deleteTestUsers } from "../testing/db-test-helpers";
import { accessAdminEmail, setAccessKeyResolverForTesting, verifyAccessToken, type AccessConfig } from "./cloudflare-access";
import { requireAdmin, requireSuperAdmin } from "./require-admin";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const TEAM = "claxon-test.cloudflareaccess.com";
const AUD = "test-aud-tag";
const ADMIN = `access-admin-${Date.now()}@example.test`;
const config: AccessConfig = { teamDomain: TEAM, aud: AUD, adminEmails: [ADMIN] };

function token(claims: Record<string, unknown>, key = privateKey, kid = "k1"): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: now + 600, iat: now, email: ADMIN, ...claims })).toString("base64url");
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function request(opts: { header?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.header) headers["cf-access-jwt-assertion"] = opts.header;
  if (opts.cookie) headers.cookie = `CF_Authorization=${opts.cookie}`;
  return new NextRequest("http://localhost/api/admin/me", { headers });
}

beforeAll(() => setAccessKeyResolverForTesting(async (team, kid) => (team === TEAM && kid === "k1" ? publicKey : null)));
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: ADMIN }, select: { id: true } });
  await deleteTestUsers(users.map((user) => user.id));
  await prisma.$disconnect();
});

describe("verifyAccessToken", () => {
  it("accepts a token Cloudflare signed for this app", async () => {
    expect(await verifyAccessToken(token({}), config)).toBe(ADMIN);
  });

  it.each([
    ["another app's audience", token({ aud: ["other-app"] })],
    ["another team", token({ iss: "https://evil.cloudflareaccess.com" })],
    ["an expired token", token({ exp: Math.floor(Date.now() / 1000) - 5 })],
    ["a key that isn't Cloudflare's", token({}, other.privateKey)],
    ["an unknown key id", token({}, privateKey, "k2")],
    ["garbage", "not.a.jwt"],
  ])("rejects %s", async (_label, jwt) => {
    expect(await verifyAccessToken(jwt, config)).toBeNull();
  });

  it("rejects a token whose email was edited after signing", async () => {
    const [header, , signature] = token({}).split(".");
    const forged = Buffer.from(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: 9e9, email: "someone@else.test" })).toString("base64url");
    expect(await verifyAccessToken(`${header}.${forged}.${signature}`, config)).toBeNull();
  });
});

describe("accessAdminEmail", () => {
  it("reads the header or the CF_Authorization cookie", async () => {
    expect(await accessAdminEmail(request({ header: token({}) }), config)).toBe(ADMIN);
    expect(await accessAdminEmail(request({ cookie: token({}) }), config)).toBe(ADMIN);
  });

  it("refuses a valid token for an address that isn't an admin", async () => {
    expect(await accessAdminEmail(request({ header: token({ email: "visitor@example.test" }) }), config)).toBeNull();
  });
});

describe("requireAdmin with Cloudflare Access", () => {
  function configure() {
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", TEAM);
    vi.stubEnv("CF_ACCESS_AUD", AUD);
    vi.stubEnv("ADMIN_EMAILS", ADMIN);
  }

  it("lets the allowed email in with no app session, as SUPER_ADMIN", async () => {
    configure();
    const admin = await requireAdmin(prisma, request({ header: token({}) }));
    expect(admin.email).toBe(ADMIN);
    expect(admin.role).toBe("SUPER_ADMIN");
    expect((await requireSuperAdmin(prisma, request({ cookie: token({}) }))).id).toBe(admin.id);
  });

  it("is a 404 for anyone else, signed in or not", async () => {
    configure();
    await expect(requireAdmin(prisma, request())).rejects.toBeInstanceOf(NotFoundError);
    await expect(requireAdmin(prisma, request({ header: token({ email: "visitor@example.test" }) }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is a 404 in production when Access isn't configured", async () => {
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "");
    vi.stubEnv("APP_ENV", "production");
    await expect(requireAdmin(prisma, request({ header: token({}) }))).rejects.toBeInstanceOf(NotFoundError);
  });
});
