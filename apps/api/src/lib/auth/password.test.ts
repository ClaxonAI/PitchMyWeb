import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("never stores the plaintext password", async () => {
    const hash = await hashPassword("correcthorsebattery");
    expect(hash).not.toBe("correcthorsebattery");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies a matching password", async () => {
    const hash = await hashPassword("correcthorsebattery");
    await expect(verifyPassword("correcthorsebattery", hash)).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await hashPassword("correcthorsebattery");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (random salt) for the same password", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    await expect(verifyPassword("same-password", a)).resolves.toBe(true);
    await expect(verifyPassword("same-password", b)).resolves.toBe(true);
  });
});
