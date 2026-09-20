// Raw Serper.dev HTTP client (Google Maps + Google Search), analogous to
// nominatim.ts's role for OverpassSource: this file knows the wire format,
// serper.ts (the BusinessDiscoverySource) knows the discovery domain.

export class SerperRequestError extends Error {
  constructor(
    message: string,
    /** false only for errors a retry can never fix (bad API key, malformed query). Rate limits/5xx default to true. */
    readonly retryable: boolean = true,
  ) {
    super(message);
  }
}

export type SerperClientOptions = {
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type SerperMapsPlace = {
  title?: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  type?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  cid?: string;
};

type SerperMapsResponse = { places?: SerperMapsPlace[]; ll?: string };

export class SerperClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SerperClientOptions) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "Serper request timed out" : "Serper request failed";
      throw new SerperRequestError(reason);
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (response.status === 401 || response.status === 403) {
      throw new SerperRequestError("Serper rejected the API key (check SERPER_API_KEY)", false);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new SerperRequestError(`Serper is overloaded (HTTP ${response.status}) — retry later`);
    }
    if (!response.ok) {
      throw new SerperRequestError(`Serper responded with HTTP ${response.status}`, false);
    }
    return (await response.json()) as T;
  }

  /** One page of Google Maps results for a free-text query. */
  async searchMapsPage(query: string, page: number, ll?: string): Promise<{ places: SerperMapsPlace[]; ll?: string }> {
    const body: Record<string, unknown> = { q: query, gl: "in", hl: "en" };
    if (page > 1) body.page = page;
    if (ll) body.ll = ll;
    const result = await this.post<SerperMapsResponse>("https://google.serper.dev/maps", body);
    return { places: result.places ?? [], ll: result.ll };
  }

  /** Plain google.com search, used here to find a business's social profiles by name. */
  async search(query: string): Promise<unknown> {
    return this.post("https://google.serper.dev/search", { q: query, num: 10, gl: "us" });
  }
}

const SOCIAL_PATTERNS: Record<"instagram" | "facebook", RegExp> = {
  instagram: /https?:\/\/(www\.)?instagram\.com\/(?!reel|p\/)[^"&\s]+/i,
  facebook: /https?:\/\/(www\.)?facebook\.com\/(?!share|sharer|videos)[^"&\s]+/i,
};

/** Regex-scrapes a Serper search response for the first Instagram/Facebook profile link — the two socials Business actually has columns for. */
export function parseSocialLinks(searchResult: unknown): { instagram: string | null; facebook: string | null } {
  const text = JSON.stringify(searchResult);
  const instagram = SOCIAL_PATTERNS.instagram.exec(text)?.[0]?.split("?")[0] ?? null;
  const facebook = SOCIAL_PATTERNS.facebook.exec(text)?.[0]?.split("?")[0] ?? null;
  return { instagram, facebook };
}
