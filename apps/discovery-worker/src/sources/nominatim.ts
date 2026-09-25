// OSM's own geocoder — resolves a campaign's free-text `location` (e.g.
// "Chennai") into a bounding box for overpass.ts's query. Same fetch-wrapper
// shape as apps/api's HttpRazorpayClient: AbortController
// timeout, sanitized errors, injectable fetch for tests.
//
// Usage policy (nominatim.org): max ~1 request/sec, a real identifying
// User-Agent (not a generic one), cache results where possible. Production
// should point NOMINATIM_API_URL at a self-hosted instance or a paid
// provider instead of the public one for anything beyond light use.

export class GeocodingError extends Error {
  constructor(
    message: string,
    /** false for errors a retry can never fix (a bad location string, no result) — timeouts/429 default to true. */
    readonly retryable: boolean = false,
  ) {
    super(message);
  }
}

export type BoundingBox = {
  /** south, west, north, east — Overpass QL's own bbox order. */
  south: number;
  west: number;
  north: number;
  east: number;
};

export type NominatimClientOptions = {
  apiUrl: string;
  userAgent: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class NominatimClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: NominatimClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async geocode(location: string): Promise<BoundingBox> {
    const url = new URL("/search", this.options.apiUrl);
    url.searchParams.set("q", location);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        headers: { "User-Agent": this.options.userAgent },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "Nominatim request timed out" : "Nominatim request failed";
      throw new GeocodingError(reason, true);
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (response.status === 429) {
      throw new GeocodingError("Nominatim is rate-limiting requests (HTTP 429) — retry later", true);
    }
    if (!response.ok) {
      throw new GeocodingError(`Nominatim responded with HTTP ${response.status}`);
    }

    const results = (await response.json()) as Array<{ boundingbox: [string, string, string, string] }>;
    const first = results[0];
    if (!first) throw new GeocodingError(`No geocoding result for "${location}"`);

    // Nominatim's own order: [south, north, west, east] (as strings).
    const [south, north, west, east] = first.boundingbox.map(Number) as [number, number, number, number];
    return { south, north, west, east };
  }
}
