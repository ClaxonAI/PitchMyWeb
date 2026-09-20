import { describe, expect, it, vi } from "vitest";
import { parseSocialLinks, SerperClient, SerperRequestError } from "./serper-client";

const options = { apiKey: "test-key" };

describe("SerperClient.searchMapsPage", () => {
  it("sends the API key header and query body, and returns places + ll", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://google.serper.dev/maps");
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ q: "dentist in Pune", gl: "in", hl: "en" });
      return new Response(JSON.stringify({ places: [{ title: "Smile Dental", phoneNumber: "+911234567890" }], ll: "@18.5,73.8,13z" }), { status: 200 });
    });
    const client = new SerperClient({ ...options, fetchImpl });
    const result = await client.searchMapsPage("dentist in Pune", 1);
    expect(result.places).toHaveLength(1);
    expect(result.ll).toBe("@18.5,73.8,13z");
  });

  it("includes page and ll on subsequent pages", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ q: "dentist in Pune", gl: "in", hl: "en", page: 2, ll: "@18.5,73.8,13z" });
      return new Response(JSON.stringify({ places: [] }), { status: 200 });
    });
    const client = new SerperClient({ ...options, fetchImpl });
    await client.searchMapsPage("dentist in Pune", 2, "@18.5,73.8,13z");
  });

  it("throws a non-retryable SerperRequestError on 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const client = new SerperClient({ ...options, fetchImpl });
    await expect(client.searchMapsPage("x", 1)).rejects.toMatchObject({ retryable: false });
  });

  it("throws a retryable SerperRequestError on 429", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const client = new SerperClient({ ...options, fetchImpl });
    await expect(client.searchMapsPage("x", 1)).rejects.toMatchObject({ retryable: true });
    await expect(client.searchMapsPage("x", 1)).rejects.toThrow(SerperRequestError);
  });
});

describe("parseSocialLinks", () => {
  it("extracts the first Instagram and Facebook profile links, stripping query strings", () => {
    const result = parseSocialLinks({
      organic: [
        { link: "https://instagram.com/smiledental?hl=en" },
        { link: "https://facebook.com/smiledental" },
        { link: "https://facebook.com/share/xyz" }, // a /share/ link — excluded by the pattern regardless of position
      ],
    });
    expect(result.instagram).toBe("https://instagram.com/smiledental");
    expect(result.facebook).toBe("https://facebook.com/smiledental");
  });

  it("returns nulls when nothing matches", () => {
    expect(parseSocialLinks({ organic: [{ link: "https://example.com" }] })).toEqual({ instagram: null, facebook: null });
  });
});
