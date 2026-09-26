import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NICHES, pickPreviewTemplate } from "@pitchmyweb/templates";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { nicheAvailability, type AvailabilityDeps } from "./availability.service";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

function memoryCache(): AvailabilityDeps["cache"] & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) };
}

describe("niche catalogue", () => {
  it("each niche's search phrase builds the template its card shows", () => {
    for (const niche of NICHES) {
      expect(pickPreviewTemplate(niche.category), niche.slug).toBe(niche.template);
    }
  });
});

describe("nicheAvailability", () => {
  it("counts places with a phone and no website, and caches each search for a day", async () => {
    const user = await createTestUser("niches-count");
    createdUserIds.push(user.id);
    const searchMaps = vi.fn(async (query: string) =>
      query.startsWith("Restaurant")
        ? [
            { title: "A", phoneNumber: "+91 1", cid: "1" },
            { title: "B", phoneNumber: "+91 2", cid: "2", website: "https://b.example" },
            { title: "C", cid: "3" },
          ]
        : Array.from({ length: 20 }, (_, i) => ({ title: `P${i}`, phoneNumber: `+91 ${i}`, cid: `x${i}` })),
    );
    const cache = memoryCache();
    const first = await nicheAvailability(prisma, user.id, "Chennai", { searchMaps, cache });
    const restaurants = first.niches.find((n) => n.slug === "restaurants")!;
    expect(restaurants).toMatchObject({ available: 1, more: false });
    expect(first.niches.find((n) => n.slug === "gyms")).toMatchObject({ available: 20, more: true });
    expect(searchMaps).toHaveBeenCalledTimes(NICHES.length);

    await nicheAvailability(prisma, user.id, "  chennai ", { searchMaps, cache });
    expect(searchMaps).toHaveBeenCalledTimes(NICHES.length);
  });

  it("still returns every niche when search is not configured or a search fails", async () => {
    const user = await createTestUser("niches-off");
    createdUserIds.push(user.id);
    const off = await nicheAvailability(prisma, user.id, "Chennai", { searchMaps: null, cache: memoryCache() });
    expect(off.configured).toBe(false);
    expect(off.niches).toHaveLength(NICHES.length);
    expect(off.niches.every((n) => n.available === null)).toBe(true);

    const flaky = await nicheAvailability(prisma, user.id, "Madurai", {
      searchMaps: async (q) => {
        if (q.startsWith("Gym")) throw new Error("boom");
        return [];
      },
      cache: memoryCache(),
    });
    expect(flaky.niches.find((n) => n.slug === "gyms")!.available).toBeNull();
    expect(flaky.niches.find((n) => n.slug === "salons")!.available).toBe(0);
  });
});

describe("the New campaign cards", () => {
  // apps/web renders the cards from its own copy (apps/web/src/data/niches.ts)
  // so they appear before any request; it must list the same niches.
  it("list exactly the niches the API counts", () => {
    const web = readFileSync(new URL("../../../../web/src/data/niches.ts", import.meta.url), "utf8");
    const listed = [...web.matchAll(/slug: "([^"]+)", label: "([^"]+)", category: "([^"]+)", template: "([^"]+)"/g)].map((m) => ({
      slug: m[1],
      label: m[2],
      category: m[3],
      template: m[4],
    }));
    expect(listed).toEqual(NICHES.map(({ slug, label, category, template }) => ({ slug, label, category, template })));
  });
});
