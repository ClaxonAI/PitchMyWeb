import { createRedisConnection } from "@pitchmyweb/contracts";
import type { PrismaClient } from "@pitchmyweb/db";
import { NICHES, type Niche } from "@pitchmyweb/templates";
import { excludedExternalIds } from "../leads/claims.service";

// "How many businesses without a website are there near <city> for each
// niche we have a template for?" — the numbers on the New campaign cards.
//
// One Google Maps page per niche (the same query the discovery worker runs,
// through the same Serper API), counting places with a phone number and no
// website. The raw result is cached per city and niche for a day: counts
// barely move within a day, and each lookup costs a paid search. What is
// cached is the list of place ids, not a number, because the count a user
// sees leaves out places other users hold (business exclusivity) and places
// this user already has, both of which differ per user and change by the
// minute.

const CACHE_TTL_SECONDS = 24 * 60 * 60;
/** Google Maps returns up to 20 places a page; a full page means there are likely more. */
const MAPS_PAGE_SIZE = 20;
const CONCURRENCY = 4;

export type NicheAvailability = Niche & {
  /** Places without a website this user could pitch, or null when counts are unavailable. */
  available: number | null;
  /** True when the first page was full, so the real number is higher ("20+"). */
  more: boolean;
};

type CachedPage = { ids: string[]; full: boolean };

export type AvailabilityDeps = {
  /** One Google Maps page for "<category> in <location>"; null when search is not configured. */
  searchMaps: ((query: string) => Promise<Array<{ cid?: string; phoneNumber?: string; website?: string; title?: string }>>) | null;
  cache: { get(key: string): Promise<string | null>; set(key: string, value: string, ttlSeconds: number): Promise<void> };
};

export async function nicheAvailability(
  db: PrismaClient,
  userId: string,
  location: string,
  deps: AvailabilityDeps = defaultDeps(),
): Promise<{ location: string; configured: boolean; niches: NicheAvailability[] }> {
  const city = location.trim();
  if (!deps.searchMaps) {
    return { location: city, configured: false, niches: NICHES.map((niche) => ({ ...niche, available: null, more: false })) };
  }
  const searchMaps = deps.searchMaps;
  const cityKey = city.toLowerCase().replace(/\s+/g, " ");

  const pages = await mapPool(NICHES, CONCURRENCY, async (niche): Promise<CachedPage | null> => {
    const key = `niches:v1:${cityKey}:${niche.slug}`;
    const cached = await deps.cache.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as CachedPage;
    try {
      const places = await searchMaps(`${niche.category} in ${city}`);
      const page: CachedPage = {
        ids: places.filter((p) => p.title && p.phoneNumber && !p.website).map((p) => p.cid ?? `${p.title}|${p.phoneNumber}`),
        full: places.length >= MAPS_PAGE_SIZE,
      };
      await deps.cache.set(key, JSON.stringify(page), CACHE_TTL_SECONDS).catch(() => undefined);
      return page;
    } catch {
      // One niche failing to count must not blank the others.
      return null;
    }
  });

  const excluded = new Set(await excludedExternalIds(db, { userId, source: "serper", location: city }));
  return {
    location: city,
    configured: true,
    niches: NICHES.map((niche, index) => {
      const page = pages[index];
      if (!page) return { ...niche, available: null, more: false };
      return { ...niche, available: page.ids.filter((id) => !excluded.has(id)).length, more: page.full };
    }),
  };
}

async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------

const globalForNiches = globalThis as unknown as { nichesRedis?: ReturnType<typeof createRedisConnection> };

function redis(): ReturnType<typeof createRedisConnection> {
  globalForNiches.nichesRedis ??= createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
  return globalForNiches.nichesRedis;
}

function defaultDeps(): AvailabilityDeps {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  return {
    searchMaps: apiKey
      ? async (query) => {
          const response = await fetch("https://google.serper.dev/maps", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": apiKey },
            body: JSON.stringify({ q: query, gl: "in", hl: "en" }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) throw new Error(`Serper responded with HTTP ${response.status}`);
          const body = (await response.json()) as { places?: Array<{ cid?: string; phoneNumber?: string; website?: string; title?: string }> };
          return body.places ?? [];
        }
      : null,
    cache: {
      get: (key) => redis().get(key),
      set: async (key, value, ttl) => {
        await redis().set(key, value, "EX", ttl);
      },
    },
  };
}
