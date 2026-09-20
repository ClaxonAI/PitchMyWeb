import { describe, expect, it } from "vitest";
import { aiPitchResponseSchema } from "./pitch";

describe("aiPitchResponseSchema", () => {
  it("accepts a valid response (test 2)", () => {
    expect(aiPitchResponseSchema.safeParse({ message: "Hi Lakshmi Dental Care, we noticed you don't have a website yet..." }).success).toBe(true);
  });

  it("rejects a missing message field (test 3)", () => {
    expect(aiPitchResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(aiPitchResponseSchema.safeParse({ message: "" }).success).toBe(false);
  });

  it("rejects a message over the length limit", () => {
    expect(aiPitchResponseSchema.safeParse({ message: "x".repeat(1201) }).success).toBe(false);
  });

  it("rejects extra/unexpected fields (do not trust the model's claimed structure)", () => {
    expect(aiPitchResponseSchema.safeParse({ message: "Hi there", recommendedService: "WEBSITE" }).success).toBe(false);
    expect(aiPitchResponseSchema.safeParse({ message: "Hi there", html: "<script>alert(1)</script>" }).success).toBe(false);
  });

  it("rejects a non-string message", () => {
    expect(aiPitchResponseSchema.safeParse({ message: 12345 }).success).toBe(false);
  });
});
