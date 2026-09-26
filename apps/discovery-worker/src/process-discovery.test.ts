import { describe, expect, it, vi } from "vitest";
import { processDiscovery, type JobParams, type ProcessDeps } from "./process-discovery";
import type { DiscoveredBusiness } from "./sources/index";

const params: JobParams = { executionId: "exec-1", location: "Chennai", category: "Dental Clinic", radius: null, minRating: null, minReviews: null, leadLimit: 20 };

function makeDeps(overrides: Partial<ProcessDeps> = {}): ProcessDeps {
  return {
    source: { search: vi.fn(async () => []) },
    fetchJobParams: vi.fn(async () => params),
    reportResults: vi.fn(async () => undefined),
    reportFailure: vi.fn(async () => undefined),
    log: vi.fn(),
    ...overrides,
  };
}

describe("processDiscovery", () => {
  it("skips (no-op) when the execution is not RUNNING (fetchJobParams returns null)", async () => {
    const deps = makeDeps({ fetchJobParams: vi.fn(async () => null) });
    const outcome = await processDiscovery(deps, "exec-1");
    expect(outcome).toBe("skipped");
    expect(deps.source.search).not.toHaveBeenCalled();
    expect(deps.reportResults).not.toHaveBeenCalled();
  });

  it("searches with the fetched params and reports the results on success", async () => {
    const businesses: DiscoveredBusiness[] = [
      { name: "Lakshmi Dental Care", category: "Dental Clinic", address: null, city: "Chennai", phone: null, email: null, website: null, instagram: null, facebook: null, rating: null, reviewCount: null, latitude: null, longitude: null, source: "osm", externalId: "node/1" },
    ];
    const source = { search: vi.fn(async () => businesses) };
    const deps = makeDeps({ source });

    const outcome = await processDiscovery(deps, "exec-1");

    expect(outcome).toBe("completed");
    expect(source.search).toHaveBeenCalledWith({
      location: "Chennai",
      category: "Dental Clinic",
      radius: null,
      minRating: null,
      minReviews: null,
      leadLimit: 20,
      excludeExternalIds: new Set(),
    });
    expect(deps.reportResults).toHaveBeenCalledWith("exec-1", businesses);
    expect(deps.reportFailure).not.toHaveBeenCalled();
  });

  it("reports a fixed failure reason (not a raw stack trace) when the search throws on the final attempt", async () => {
    const source = { search: vi.fn(async () => { throw new Error("Overpass is overloaded (HTTP 429) — retry later"); }) };
    const deps = makeDeps({ source });

    const outcome = await processDiscovery(deps, "exec-1");

    expect(outcome).toBe("failed");
    expect(deps.reportFailure).toHaveBeenCalledWith("exec-1", "Overpass is overloaded (HTTP 429) — retry later");
    expect(deps.reportResults).not.toHaveBeenCalled();
  });

  it("rethrows (without reporting failure) on a transient error when attempts remain, so BullMQ retries", async () => {
    const error = Object.assign(new Error("Overpass is overloaded (HTTP 504) — retry later"), { retryable: true });
    const source = { search: vi.fn(async () => { throw error; }) };
    const deps = makeDeps({ source });

    await expect(processDiscovery(deps, "exec-1", { number: 1, max: 3 })).rejects.toThrow(error);

    expect(deps.reportFailure).not.toHaveBeenCalled();
    expect(deps.reportResults).not.toHaveBeenCalled();
  });

  it("reports failure on the final attempt even for a transient error", async () => {
    const error = Object.assign(new Error("Overpass is overloaded (HTTP 504) — retry later"), { retryable: true });
    const source = { search: vi.fn(async () => { throw error; }) };
    const deps = makeDeps({ source });

    const outcome = await processDiscovery(deps, "exec-1", { number: 3, max: 3 });

    expect(outcome).toBe("failed");
    expect(deps.reportFailure).toHaveBeenCalledWith("exec-1", error.message);
  });

  it("reports failure immediately for a non-retryable error, even with attempts remaining", async () => {
    const error = Object.assign(new Error("No geocoding result for \"Nowhereville\""), { retryable: false });
    const source = { search: vi.fn(async () => { throw error; }) };
    const deps = makeDeps({ source });

    const outcome = await processDiscovery(deps, "exec-1", { number: 1, max: 3 });

    expect(outcome).toBe("failed");
    expect(deps.reportFailure).toHaveBeenCalledWith("exec-1", error.message);
  });

  it("does not fail the job when publish throws", async () => {
    const publish = vi.fn(async () => {
      throw new Error("redis down");
    });
    const deps = makeDeps({ publish });

    const outcome = await processDiscovery(deps, "exec-1");

    expect(outcome).toBe("completed");
    expect(deps.reportResults).toHaveBeenCalled();
    expect(publish).toHaveBeenCalled();
  });
});
