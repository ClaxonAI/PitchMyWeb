import { describe, expect, it, vi } from "vitest";
import { GeocodingError, NominatimClient } from "./nominatim";

const options = { apiUrl: "https://nominatim.example", userAgent: "Test-Agent/1.0 (test@example.com)" };

describe("NominatimClient.geocode", () => {
  it("sends the query with a real User-Agent and parses Nominatim's boundingbox order", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://nominatim.example/search?q=Chennai&format=json&limit=1");
      expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(options.userAgent);
      return new Response(JSON.stringify([{ boundingbox: ["12.9", "13.2", "80.1", "80.3"] }]), { status: 200 });
    });
    const client = new NominatimClient({ ...options, fetchImpl });
    const bbox = await client.geocode("Chennai");
    expect(bbox).toEqual({ south: 12.9, north: 13.2, west: 80.1, east: 80.3 });
  });

  it("throws a non-retryable GeocodingError when nothing is found", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    const client = new NominatimClient({ ...options, fetchImpl });
    await expect(client.geocode("Nowhereville")).rejects.toThrow(GeocodingError);
    await expect(client.geocode("Nowhereville")).rejects.toMatchObject({ retryable: false });
  });

  it("throws a retryable GeocodingError on a 429 (rate limited) response", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const client = new NominatimClient({ ...options, fetchImpl });
    await expect(client.geocode("Chennai")).rejects.toThrow(GeocodingError);
    await expect(client.geocode("Chennai")).rejects.toMatchObject({ retryable: true });
  });

  it("throws a non-retryable GeocodingError on another non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const client = new NominatimClient({ ...options, fetchImpl });
    await expect(client.geocode("Chennai")).rejects.toMatchObject({ retryable: false });
  });

  it("throws a retryable GeocodingError on a connection failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new NominatimClient({ ...options, fetchImpl });
    await expect(client.geocode("Chennai")).rejects.toThrow(GeocodingError);
    await expect(client.geocode("Chennai")).rejects.toMatchObject({ retryable: true });
  });

  it("throws a retryable GeocodingError on timeout without hanging the test", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const client = new NominatimClient({ ...options, fetchImpl, timeoutMs: 20 });
    await expect(client.geocode("Chennai")).rejects.toMatchObject({ retryable: true });
  });
});
