import type { BusinessDiscoverySource, DiscoveredBusiness, DiscoveryQuery } from "./index";
import { tagsForCategory, type OsmTag } from "./category-map";
import { NominatimClient, type BoundingBox } from "./nominatim";

// The actual Phase 2B discovery source: geocodes the campaign's `location`
// via Nominatim, then queries Overpass for POIs matching the campaign's
// `category` within that bounding box. Overpass has no rating/review-count
// data (OSM doesn't track that) and no live website-liveness signal — both
// stay null here; the former is a genuine data gap, the latter is exactly
// Phase 2C's job (deferred), not this source's.

export class OverpassQueryError extends Error {
  constructor(
    message: string,
    /** false only for errors a retry can never fix (a malformed query) — timeouts and overload (429/504) default to true. */
    readonly retryable: boolean = true,
  ) {
    super(message);
  }
}

export type OverpassClientOptions = {
  apiUrl: string;
  // Confirmed live against the public instance (2026-09-17): a request with
  // no User-Agent (or a bare/default one) is rejected with 406 Not
  // Acceptable before it ever reaches the query engine — this is not
  // optional the way it might be for some APIs.
  userAgent: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

function buildQuery(bbox: BoundingBox, tags: OsmTag[], limit: number): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const clauses = tags.flatMap((tag) => [`node["${tag.key}"="${tag.value}"](${bboxStr});`, `way["${tag.key}"="${tag.value}"](${bboxStr});`]);
  return `[out:json][timeout:25];(${clauses.join("")});out center ${limit};`;
}

function firstDefined(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) return value.trim();
  }
  return null;
}

function addressFrom(tags: Record<string, string>): string | null {
  const houseNumber = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (street && houseNumber) return `${houseNumber} ${street}`;
  return street ?? null;
}

function toDiscoveredBusiness(element: OverpassElement, category: string, queryLocation: string): DiscoveredBusiness | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null; // Unnamed POIs aren't useful leads.

  const lat = element.lat ?? element.center?.lat ?? null;
  const lon = element.lon ?? element.center?.lon ?? null;

  return {
    name,
    category,
    address: addressFrom(tags),
    // OSM POIs very commonly lack an addr:city tag even when correctly
    // returned by the bbox query — falling back to the campaign's own
    // requested location isn't inventing data, it's asserting what the
    // geocoded bounding box search already guarantees geographically.
    // Without this, apps/api's matchesCampaignFilters location text-match
    // (city/address substring) rejects nearly every real OSM result, since
    // that check was designed for providers (like DemoProvider) that always
    // stamp the city into the record themselves.
    city: firstDefined(tags["addr:city"], queryLocation),
    phone: firstDefined(tags.phone, tags["contact:phone"]),
    email: firstDefined(tags.email, tags["contact:email"]),
    website: firstDefined(tags.website, tags["contact:website"]),
    instagram: firstDefined(tags["contact:instagram"]),
    facebook: firstDefined(tags["contact:facebook"]),
    rating: null,
    reviewCount: null,
    latitude: lat,
    longitude: lon,
    source: "osm",
    externalId: `${element.type}/${element.id}`,
  };
}

export class OverpassSource implements BusinessDiscoverySource {
  private readonly apiUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly nominatim: NominatimClient;

  constructor(options: OverpassClientOptions & { nominatim: NominatimClient }) {
    this.apiUrl = options.apiUrl;
    this.userAgent = options.userAgent;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.nominatim = options.nominatim;
  }

  async search(query: DiscoveryQuery): Promise<DiscoveredBusiness[]> {
    const tags = tagsForCategory(query.category);
    if (!tags) {
      // No OSM tag mapping for this category — a free-text classifier is
      // Phase 2D's job, not this source's. Returning no results (rather than
      // guessing a tag) keeps a bad mapping from silently becoming bad data.
      return [];
    }

    const bbox = await (async () => {
      await query.onProgress?.({ stage: "GEOCODING" });
      return this.nominatim.geocode(query.location);
    })();
    await query.onProgress?.({ stage: "SEARCHING" });
    const overpassQuery = buildQuery(bbox, tags, query.leadLimit);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.apiUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": this.userAgent },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "Overpass request timed out" : "Overpass request failed";
      throw new OverpassQueryError(reason);
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (response.status === 429 || response.status === 504) {
      throw new OverpassQueryError(`Overpass is overloaded (HTTP ${response.status}) — retry later`);
    }
    if (!response.ok) {
      // Any other status (e.g. 400 on a malformed query) is a request-shape
      // problem, not a transient one — retrying sends the same bad query again.
      throw new OverpassQueryError(`Overpass responded with HTTP ${response.status}`, false);
    }

    const body = (await response.json()) as OverpassResponse;
    const businesses: DiscoveredBusiness[] = [];
    for (const element of body.elements) {
      const business = toDiscoveredBusiness(element, query.category, query.location);
      if (business && business.website === null && business.phone !== null) businesses.push(business);
    }
    return businesses;
  }
}
