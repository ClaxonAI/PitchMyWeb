import { describe, expect, it } from "vitest";
import { downloadBaseName } from "./pipeline-view";

describe("downloadBaseName", () => {
  it("makes business names safe for a file name", () => {
    expect(downloadBaseName("Senthur Homes & Promotors | Real Estate")).toBe("Senthur-Homes-Promotors-Real-Estate");
    expect(downloadBaseName('A/B "Realty"\..')).toBe("AB-Realty");
  });

  it("falls back when nothing usable is left", () => {
    expect(downloadBaseName("!!!")).toBe("demo");
    expect(downloadBaseName("சக்தி")).toBe("demo");
  });

  it("caps the length", () => {
    expect(downloadBaseName("x".repeat(200)).length).toBe(60);
  });
});
