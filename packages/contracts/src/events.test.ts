import { describe, expect, it } from "vitest";
import { parseDiscoveryEvent, type DiscoveryEvent } from "./events";

const at = "2026-09-18T09:00:00.000Z";

describe("parseDiscoveryEvent", () => {
  it("returns null on junk", () => {
    expect(parseDiscoveryEvent("not-json")).toBeNull();
    expect(parseDiscoveryEvent("{}")).toBeNull();
    expect(parseDiscoveryEvent(JSON.stringify({ stage: "QUEUED" }))).toBeNull();
  });

  it("rejects an unknown stage literal", () => {
    expect(parseDiscoveryEvent(JSON.stringify({ stage: "SCRAPING", executionId: "e1", at }))).toBeNull();
  });

  it.each([
    { stage: "QUEUED", executionId: "e1", at },
    { stage: "GEOCODING", executionId: "e1", at },
    { stage: "SEARCHING", executionId: "e1", at },
    { stage: "ENRICHING", executionId: "e1", at, completed: 12, total: 40 },
    { stage: "COMPLETED", executionId: "e1", at, found: 40 },
    { stage: "FAILED", executionId: "e1", at, message: "Overpass timed out" },
  ] satisfies DiscoveryEvent[])("round-trips $stage", (event) => {
    expect(parseDiscoveryEvent(JSON.stringify(event))).toEqual(event);
  });
});
