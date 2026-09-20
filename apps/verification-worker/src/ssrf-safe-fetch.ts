import { lookup } from "node:dns/promises";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";

// A general-purpose SSRF-safe fetcher for a URL this process does not
// control (Business.website — OSM/third-party data). Nothing else in this
// codebase is safe to reuse here: apps/recorder-worker's url-guard.ts is a
// same-origin allowlist against this app's *own* preview URLs, not usable
// for arbitrary third-party hosts.
//
// The core defense is resolve-then-connect-to-the-resolved-IP: a plain
// `fetch()` (or node:http given a hostname) re-resolves DNS at connect time,
// which is exactly the gap a DNS-rebinding attack exploits (pass validation
// against a public IP, then have the second lookup — the real connection —
// return a private one). Resolving once, validating that result, and then
// connecting directly to the validated IP (with the original hostname sent
// as the Host header, and as the TLS SNI/servername on https) closes that
// gap. Every redirect hop re-runs the whole check against its own target —
// a malicious redirect must not be able to skip validation.

export type SsrfSafeFetchReason = "invalid_url" | "private_address" | "too_many_redirects" | "response_too_large" | "timeout" | "connection_failed";

export class SsrfSafeFetchError extends Error {
  constructor(
    readonly reason: SsrfSafeFetchReason,
    message: string,
  ) {
    super(message);
  }
}

export type ResolvedAddress = { address: string; family: number };

export type ConnectParams = {
  protocol: "http:" | "https:";
  /** The validated IP to actually connect to — never re-resolved. */
  ip: string;
  /** The original hostname — sent as Host header and TLS servername only. */
  hostname: string;
  port: number;
  path: string;
  method: "HEAD" | "GET";
  timeoutMs: number;
};

export type ConnectResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: NodeJS.ReadableStream;
};

export type SsrfSafeFetchOptions = {
  method?: "HEAD" | "GET";
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  /** Injectable for tests: resolves a hostname to every candidate IP. */
  resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  /** Injectable for tests: performs the actual connection to a pre-resolved IP. */
  connect?: (params: ConnectParams) => Promise<ConnectResult>;
};

export type SsrfSafeFetchResult = { status: number; finalUrl: string; body: string };

const DEFAULT_MAX_REDIRECTS = 2;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB — plenty for parked-page HTML.

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true; // malformed -> treat as unsafe
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a >= 224) return true; // 224.0.0.0/4 multicast + reserved above it
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (lower.startsWith("ff")) return true; // ff00::/8 multicast
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice("::ffff:".length)); // IPv4-mapped
  return false;
}

function isPrivateAddress(address: string, family: number): boolean {
  return family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
}

async function defaultResolveHost(hostname: string): Promise<ResolvedAddress[]> {
  const results = await lookup(hostname, { all: true });
  return results.map((r) => ({ address: r.address, family: r.family }));
}

function defaultConnect(params: ConnectParams): Promise<ConnectResult> {
  return new Promise((resolve, reject) => {
    const transport = params.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: params.ip,
        port: params.port,
        path: params.path,
        method: params.method,
        headers: { Host: params.hostname, "user-agent": "PitchMyWeb-VerificationWorker/1.0" },
        // TLS SNI/cert validation still targets the real hostname, even
        // though the socket connects to the pre-resolved IP.
        ...(params.protocol === "https:" ? { servername: params.hostname } : {}),
        timeout: params.timeoutMs,
      },
      (res: IncomingMessage) => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, body: res });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Connection timed out")));
    req.on("error", (error) => reject(error));
    req.end();
  });
}

async function readBodyCapped(body: NodeJS.ReadableStream, maxBytes: number): Promise<string> {
  let total = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        throw new SsrfSafeFetchError("response_too_large", `Response exceeded ${maxBytes} bytes`);
      }
      chunks.push(buf);
    }
  } finally {
    // Stop reading immediately once the cap trips (or on any other early
    // exit) rather than letting a large upstream body keep streaming in.
    (body as { destroy?: (error?: Error) => void }).destroy?.();
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Fetches `url`, following up to `maxRedirects` hops, each independently SSRF-checked. */
export async function ssrfSafeFetch(url: string, options: SsrfSafeFetchOptions = {}): Promise<SsrfSafeFetchResult> {
  const method = options.method ?? "HEAD";
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const connect = options.connect ?? defaultConnect;

  let currentUrl = url;

  for (let hop = 0; ; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new SsrfSafeFetchError("invalid_url", `Malformed URL: ${currentUrl}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new SsrfSafeFetchError("invalid_url", `Unsupported protocol: ${parsed.protocol}`);
    }

    let addresses: ResolvedAddress[];
    try {
      addresses = await resolveHost(parsed.hostname);
    } catch (error) {
      throw new SsrfSafeFetchError("connection_failed", error instanceof Error ? error.message : "DNS resolution failed");
    }
    if (addresses.length === 0) {
      throw new SsrfSafeFetchError("connection_failed", `No addresses resolved for ${parsed.hostname}`);
    }
    // Any resolved address being private is enough to reject — a hostname
    // that answers with a mix of public and private IPs is not trustworthy.
    if (addresses.some((a) => isPrivateAddress(a.address, a.family))) {
      throw new SsrfSafeFetchError("private_address", `${parsed.hostname} resolves to a private/reserved address`);
    }

    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    const path = `${parsed.pathname}${parsed.search}` || "/";

    let result: ConnectResult;
    try {
      result = await Promise.race([
        connect({ protocol: parsed.protocol, ip: addresses[0]!.address, hostname: parsed.hostname, port, path, method, timeoutMs }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new SsrfSafeFetchError("timeout", "Request timed out")), timeoutMs + 500)),
      ]);
    } catch (error) {
      if (error instanceof SsrfSafeFetchError) throw error;
      throw new SsrfSafeFetchError("connection_failed", error instanceof Error ? error.message : "Connection failed");
    }

    if (result.status >= 300 && result.status < 400) {
      const location = result.headers.location;
      const locationStr = Array.isArray(location) ? location[0] : location;
      // Drain the (usually empty) redirect body so the socket isn't left
      // half-read, without trusting its size any less than a real response.
      await readBodyCapped(result.body, maxBytes).catch(() => undefined);
      if (!locationStr) throw new SsrfSafeFetchError("connection_failed", "Redirect with no Location header");
      if (hop >= maxRedirects) throw new SsrfSafeFetchError("too_many_redirects", `Exceeded ${maxRedirects} redirects`);
      currentUrl = new URL(locationStr, currentUrl).toString();
      continue;
    }

    const body = await readBodyCapped(result.body, maxBytes);
    return { status: result.status, finalUrl: currentUrl, body };
  }
}
