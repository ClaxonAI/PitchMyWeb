import { describe, expect, it } from "vitest";
import { tagsForCategory } from "./category-map";

describe("tagsForCategory", () => {
  it("resolves a known category, case/whitespace-insensitively", () => {
    expect(tagsForCategory("Dental Clinic")).toEqual([{ key: "amenity", value: "dentist" }]);
    expect(tagsForCategory("  bakery  ")).toEqual([{ key: "shop", value: "bakery" }]);
  });

  it("tries a naive singular form for a plural category", () => {
    expect(tagsForCategory("Dental Clinics")).toEqual([{ key: "amenity", value: "dentist" }]);
    expect(tagsForCategory("Gyms")).toEqual([{ key: "leisure", value: "fitness_centre" }]);
  });

  it("returns null for a category with no mapping (Phase 2D's problem, not this one's)", () => {
    expect(tagsForCategory("Aerospace Consulting")).toBeNull();
  });
});
