import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { getPublicSettings } from "./settings.service";

// backend_tasks.md section 35: "Settings should expose configurable
// service/pricing information without exposing secrets." These tests use
// the real seeded Service catalog (prisma/seed.ts) and a small set of
// Settings rows this file creates and cleans up itself.
const TEST_KEY_PREFIX = "settings-service-test-";
afterAll(async () => {
  await prisma.settings.deleteMany({ where: { key: { startsWith: TEST_KEY_PREFIX } } });
  await prisma.$disconnect();
});

describe("getPublicSettings", () => {
  it("returns the active seeded Service catalog with pricing fields intact", async () => {
    const result = await getPublicSettings(prisma);

    expect(result.services.length).toBeGreaterThan(0);
    expect(result.services.every((s) => s.active)).toBe(true);
    const website = result.services.find((s) => s.code === "WEBSITE");
    expect(website).toBeTruthy();
    expect(typeof website!.priceMin).toBe("number");
    expect(typeof website!.priceMax).toBe("number");
  });

  it("includes a non-secret-looking Settings row", async () => {
    const key = `${TEST_KEY_PREFIX}follow-up-delay-hours`;
    await prisma.settings.create({ data: { key, value: 24, description: "Default follow-up delay in hours" } });

    const result = await getPublicSettings(prisma);
    const row = result.settings.find((s) => s.key === key);
    expect(row).toEqual({ key, value: 24, description: "Default follow-up delay in hours" });
  });

  it("never returns a Settings row whose key looks like a secret", async () => {
    const secretKeys = [
      `${TEST_KEY_PREFIX}some_webhook_secret`,
      `${TEST_KEY_PREFIX}api_key`,
      `${TEST_KEY_PREFIX}admin_password`,
      `${TEST_KEY_PREFIX}session_token`,
    ];
    await Promise.all(secretKeys.map((key) => prisma.settings.create({ data: { key, value: "would-be-a-secret" } })));

    const result = await getPublicSettings(prisma);
    for (const key of secretKeys) {
      expect(result.settings.some((s) => s.key === key)).toBe(false);
    }
  });
});
