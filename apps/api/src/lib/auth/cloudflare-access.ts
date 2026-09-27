import { createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";

// Cloudflare Access sits in front of pitchmyweb.in/admin and is the only way
// into the admin portal: no app sign-in, no role in our database. After
// Access lets someone through it hands the request a JWT it signed, in the
// Cf-Access-Jwt-Assertion header on the paths it protects and in the
// CF_Authorization cookie on every request to the hostname (so the admin
// pages' own /api calls carry it too). Trusting the header or the cookie
// without checking the signature would let anyone who reaches the server
// directly, around Cloudflare, type in an email; so every token is verified
// against the team's published keys, issuer, audience and expiry.
//
//   CF_ACCESS_TEAM_DOMAIN  e.g. claxonai.cloudflareaccess.com
//   CF_ACCESS_AUD          the Access application's "Application Audience (AUD) Tag"
//   ADMIN_EMAILS           comma-separated; defaults to the owner's address

export const ACCESS_HEADER = "cf-access-jwt-assertion";
export const ACCESS_COOKIE = "CF_Authorization";
const DEFAULT_ADMIN_EMAILS = ["claxonai@gmail.com"];
const KEYS_TTL_MS = 60 * 60 * 1000;

export type AccessConfig = { teamDomain: string; aud: string; adminEmails: string[] };

export type AccessRequest = {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
};

type KeyResolver = (teamDomain: string, kid: string) => Promise<KeyObject | null>;

export function accessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !aud) return null;
  const listed = (env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return { teamDomain, aud, adminEmails: listed.length ? listed : DEFAULT_ADMIN_EMAILS };
}

export function accessToken(request: AccessRequest): string | null {
  return request.headers.get(ACCESS_HEADER)?.trim() || request.cookies.get(ACCESS_COOKIE)?.value || null;
}

/** The verified email in a Cloudflare Access token, or null for anything that doesn't check out. */
export async function verifyAccessToken(token: string, config: AccessConfig, now = Date.now()): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let payload: { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const key = await resolveKey(config.teamDomain, header.kid);
  if (!key) return null;
  const signed = Buffer.from(`${headerPart}.${payloadPart}`);
  if (!verify("RSA-SHA256", signed, key, Buffer.from(signaturePart, "base64url"))) return null;

  const seconds = now / 1000;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== `https://${config.teamDomain}`) return null;
  if (!audiences.includes(config.aud)) return null;
  if (typeof payload.exp !== "number" || payload.exp < seconds) return null;
  if (typeof payload.nbf === "number" && payload.nbf > seconds + 60) return null;
  return typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
}

/** The admin's email when the request carries a valid Access token for an allowed address; otherwise null. */
export async function accessAdminEmail(request: AccessRequest, config = accessConfig()): Promise<string | null> {
  if (!config) return null;
  const token = accessToken(request);
  if (!token) return null;
  const email = await verifyAccessToken(token, config);
  return email && config.adminEmails.includes(email) ? email : null;
}

// The team's signing keys, cached for an hour and refetched early when a
// token names a key we haven't seen (Cloudflare rotates them).
const keyCache = new Map<string, { at: number; keys: Map<string, KeyObject> }>();

async function fetchKeys(teamDomain: string): Promise<Map<string, KeyObject>> {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Cloudflare Access certs: ${response.status}`);
  const { keys = [] } = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const byKid = new Map<string, KeyObject>();
  for (const jwk of keys) if (jwk.kid) byKid.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
  return byKid;
}

let resolveKey: KeyResolver = async (teamDomain, kid) => {
  const cached = keyCache.get(teamDomain);
  if (cached && Date.now() - cached.at < KEYS_TTL_MS && cached.keys.has(kid)) return cached.keys.get(kid) ?? null;
  try {
    const keys = await fetchKeys(teamDomain);
    keyCache.set(teamDomain, { at: Date.now(), keys });
    return keys.get(kid) ?? null;
  } catch (error) {
    console.error("[admin] Could not load Cloudflare Access keys:", error instanceof Error ? error.message : error);
    return cached?.keys.get(kid) ?? null;
  }
};

/** Tests only: sign with a local key pair instead of fetching Cloudflare's. */
export function setAccessKeyResolverForTesting(resolver: KeyResolver): void {
  resolveKey = resolver;
}
