import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ssrfSafeFetch, SsrfSafeFetchError, type ConnectParams, type ConnectResult, type ResolvedAddress } from "./ssrf-safe-fetch";

function textStream(text: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(text)]);
}

function chunkedStream(chunks: string[]): NodeJS.ReadableStream {
  return Readable.from(chunks.map((c) => Buffer.from(c)));
}

function fakeResolver(byHost: Record<string, ResolvedAddress[]>) {
  return vi.fn(async (hostname: string): Promise<ResolvedAddress[]> => {
    const found = byHost[hostname];
    if (!found) throw new Error(`no fake resolution for ${hostname}`);
    return found;
  });
}

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

describe("ssrfSafeFetch", () => {
  it("returns status/body for a normal public response", async () => {
    const resolveHost = fakeResolver({ "example.com": PUBLIC });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: textStream("<html>hi</html>") }));

    const result = await ssrfSafeFetch("https://example.com/", { resolveHost, connect });

    expect(result).toEqual({ status: 200, finalUrl: "https://example.com/", body: "<html>hi</html>" });
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ ip: "93.184.216.34", hostname: "example.com", protocol: "https:" }));
  });

  it.each([
    ["10.0.0.5", 4],
    ["127.0.0.1", 4],
    ["169.254.1.1", 4],
    ["172.16.0.1", 4],
    ["192.168.1.1", 4],
    ["0.0.0.0", 4],
    ["224.0.0.1", 4],
    ["::1", 6],
    ["fd00::1", 6],
    ["fe80::1", 6],
    ["ff02::1", 6],
  ])("rejects a private/reserved address %s", async (address, family) => {
    const resolveHost = fakeResolver({ "internal.example": [{ address, family }] });
    const connect = vi.fn();

    await expect(ssrfSafeFetch("http://internal.example/", { resolveHost, connect })).rejects.toMatchObject({ reason: "private_address" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects when any resolved address is private, even if others are public", async () => {
    const resolveHost = fakeResolver({ "mixed.example": [...PUBLIC, { address: "127.0.0.1", family: 4 }] });
    await expect(ssrfSafeFetch("http://mixed.example/", { resolveHost, connect: vi.fn() })).rejects.toMatchObject({ reason: "private_address" });
  });

  it("rejects a malformed URL", async () => {
    await expect(ssrfSafeFetch("not a url", { resolveHost: vi.fn(), connect: vi.fn() })).rejects.toMatchObject({ reason: "invalid_url" });
  });

  it("rejects a non-http(s) protocol", async () => {
    await expect(ssrfSafeFetch("ftp://example.com/", { resolveHost: vi.fn(), connect: vi.fn() })).rejects.toMatchObject({ reason: "invalid_url" });
  });

  it("re-validates a redirect target and rejects one that resolves to a private address (DNS-rebinding case)", async () => {
    const resolveHost = fakeResolver({
      "public-front.example": PUBLIC,
      "internal-backend.example": [{ address: "10.1.2.3", family: 4 }],
    });
    const connect = vi.fn(async (params: ConnectParams): Promise<ConnectResult> => {
      if (params.hostname === "public-front.example") {
        return { status: 302, headers: { location: "http://internal-backend.example/secret" }, body: textStream("") };
      }
      throw new Error("should not reach the redirect target");
    });

    await expect(ssrfSafeFetch("http://public-front.example/", { resolveHost, connect })).rejects.toMatchObject({ reason: "private_address" });
  });

  it("follows a redirect within the limit and returns the final response", async () => {
    const resolveHost = fakeResolver({ "a.example": PUBLIC, "b.example": PUBLIC });
    const connect = vi.fn(async (params: ConnectParams): Promise<ConnectResult> => {
      if (params.hostname === "a.example") return { status: 301, headers: { location: "https://b.example/final" }, body: textStream("") };
      return { status: 200, headers: {}, body: textStream("final page") };
    });

    const result = await ssrfSafeFetch("https://a.example/start", { resolveHost, connect, maxRedirects: 2 });
    expect(result).toEqual({ status: 200, finalUrl: "https://b.example/final", body: "final page" });
  });

  it("throws too_many_redirects once the hop budget is exhausted", async () => {
    const resolveHost = fakeResolver({ "loop.example": PUBLIC });
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 302, headers: { location: "https://loop.example/again" }, body: textStream("") }));

    await expect(ssrfSafeFetch("https://loop.example/start", { resolveHost, connect, maxRedirects: 1 })).rejects.toMatchObject({ reason: "too_many_redirects" });
    expect(connect).toHaveBeenCalledTimes(2); // initial + 1 allowed redirect, then the 2nd redirect trips the limit
  });

  it("aborts mid-stream once the body exceeds the byte cap, without buffering it all", async () => {
    const resolveHost = fakeResolver({ "big.example": PUBLIC });
    const bigChunk = "x".repeat(1024);
    const connect = vi.fn(async (): Promise<ConnectResult> => ({ status: 200, headers: {}, body: chunkedStream([bigChunk, bigChunk, bigChunk]) }));

    await expect(ssrfSafeFetch("https://big.example/", { resolveHost, connect, maxBytes: 1500 })).rejects.toMatchObject({ reason: "response_too_large" });
  });

  it("wraps a connection failure as connection_failed", async () => {
    const resolveHost = fakeResolver({ "down.example": PUBLIC });
    const connect = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(ssrfSafeFetch("https://down.example/", { resolveHost, connect })).rejects.toMatchObject({ reason: "connection_failed" });
  });

  it("wraps a DNS resolution failure as connection_failed", async () => {
    const resolveHost = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });

    await expect(ssrfSafeFetch("https://nowhere.example/", { resolveHost, connect: vi.fn() })).rejects.toMatchObject({ reason: "connection_failed" });
  });

  it("times out a connect() that never settles", async () => {
    const resolveHost = fakeResolver({ "slow.example": PUBLIC });
    const connect = vi.fn(() => new Promise<ConnectResult>(() => undefined));

    await expect(ssrfSafeFetch("https://slow.example/", { resolveHost, connect, timeoutMs: 20 })).rejects.toMatchObject({ reason: "timeout" });
  });

  it("SsrfSafeFetchError carries its reason", () => {
    const error = new SsrfSafeFetchError("private_address", "nope");
    expect(error.reason).toBe("private_address");
    expect(error.message).toBe("nope");
  });
});
