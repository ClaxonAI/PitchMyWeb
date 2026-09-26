import { describe, expect, it } from "vitest";
import { normalizeLinkingPhone } from "./account.service";

describe("normalizeLinkingPhone", () => {
  it("adds +91 to an Indian mobile written the local way", () => {
    expect(normalizeLinkingPhone("9488329318")).toBe("919488329318");
    expect(normalizeLinkingPhone("94883 29318")).toBe("919488329318");
    expect(normalizeLinkingPhone("09488329318")).toBe("919488329318");
  });

  it("keeps a number that already has India's code", () => {
    expect(normalizeLinkingPhone("919488329318")).toBe("919488329318");
    expect(normalizeLinkingPhone("+91 94883 29318")).toBe("919488329318");
    expect(normalizeLinkingPhone("0091 94883 29318")).toBe("919488329318");
  });

  it("takes any country when the + makes the code explicit", () => {
    expect(normalizeLinkingPhone("+44 7700 900123")).toBe("447700900123");
    expect(normalizeLinkingPhone("+1 (415) 555-0132")).toBe("14155550132");
  });

  it("refuses numbers whose country code would be a guess", () => {
    // Read as +94 (Sri Lanka) by WhatsApp if passed through: the bug this guards.
    expect(normalizeLinkingPhone("88329318")).toBeNull();
    expect(normalizeLinkingPhone("5488329318")).toBeNull();
    expect(normalizeLinkingPhone("447700900123")).toBeNull();
    expect(normalizeLinkingPhone("+12")).toBeNull();
    expect(normalizeLinkingPhone("")).toBeNull();
  });
});
