import { describe, expect, it, vi } from "vitest";

vi.mock("../pipeline/discovery-queue", () => ({ enqueueDiscovery: async () => undefined }));

const { getLeadProvider, isAsyncLeadProvider } = await import("./index");

// getLeadProvider reads the environment it is handed, so these pass an
// explicit record rather than mutating process.env (which vitest.config.ts
// pins to LEAD_PROVIDER=demo for the rest of the suite).
describe("getLeadProvider", () => {
  it("defaults to serper when LEAD_PROVIDER is unset, so a deployment that forgets it still discovers real businesses", () => {
    const provider = getLeadProvider({});
    expect(isAsyncLeadProvider(provider) && provider.name).toBe("serper");
  });

  it.each(["serper", "osm", "python"])("resolves LEAD_PROVIDER=%s to the async provider of that name", (kind) => {
    const provider = getLeadProvider({ LEAD_PROVIDER: kind });
    expect(isAsyncLeadProvider(provider) && provider.name).toBe(kind);
  });

  it("still resolves LEAD_PROVIDER=demo to the synchronous demo provider", () => {
    const provider = getLeadProvider({ LEAD_PROVIDER: "demo" });
    expect(isAsyncLeadProvider(provider)).toBe(false);
  });

  it("accepts surrounding whitespace and casing, as SSM-sourced values may carry either", () => {
    const provider = getLeadProvider({ LEAD_PROVIDER: "  Serper \n" });
    expect(isAsyncLeadProvider(provider) && provider.name).toBe("serper");
  });

  it("throws on an unknown provider rather than falling back", () => {
    expect(() => getLeadProvider({ LEAD_PROVIDER: "google" })).toThrow(/not configured/i);
  });
});
