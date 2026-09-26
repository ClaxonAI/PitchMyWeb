import type { EnrichmentClient } from "../ai/enrichment.js";
import type { BusinessDiscoverySource, DiscoveredBusiness, DiscoveryQuery } from "./index.js";
import { parseSocialLinks, SerperClient } from "./serper-client.js";

// Replacement for the old n8n "AI Lead Generation & Social Discovery"
// workflow's Maps half: searches Google Maps (via Serper.dev) for the
// campaign's category+location, keeps only businesses that have a phone
// number but no website — the "easy win" leads a web-design pitch targets —
// looks up their Instagram/Facebook via a name search, and (if an
// EnrichmentClient is configured) asks an LLM for a one-line summary,
// services list and outreach message.
//
// Unlike OverpassSource, Serper Maps *does* return rating/reviewCount, so
// those flow straight into Business — a real improvement over the OSM path,
// which always leaves them null.

const MAPS_PAGE_SIZE_ESTIMATE = 20; // Serper's typical results-per-page; used only to bound how many pages we fetch.
const MAX_MAPS_PAGES = 6;
const SOCIAL_LOOKUP_DELAY_MS = 300; // Light pacing between per-business Serper search calls.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SerperSourceOptions = {
  apiKey: string;
  enrichment: EnrichmentClient;
  enrichmentModelName: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class SerperSource implements BusinessDiscoverySource {
  private readonly client: SerperClient;
  private readonly enrichment: EnrichmentClient;
  private readonly enrichmentModelName: string | null;

  constructor(options: SerperSourceOptions) {
    this.client = new SerperClient({ apiKey: options.apiKey, timeoutMs: options.timeoutMs, fetchImpl: options.fetchImpl });
    this.enrichment = options.enrichment;
    this.enrichmentModelName = options.enrichmentModelName;
  }

  async search(query: DiscoveryQuery): Promise<DiscoveredBusiness[]> {
    await query.onProgress?.({ stage: "SEARCHING" });
    const mapsQuery = `${query.category} in ${query.location}`;
    const pagesToFetch = Math.min(MAX_MAPS_PAGES, Math.max(1, Math.ceil(query.leadLimit / MAPS_PAGE_SIZE_ESTIMATE) + 1));

    let ll: string | undefined;
    const candidates: DiscoveredBusiness[] = [];
    for (let page = 1; page <= pagesToFetch && candidates.length < query.leadLimit; page += 1) {
      const { places, ll: pageLl } = await this.client.searchMapsPage(mapsQuery, page, ll);
      if (page === 1) ll = pageLl;
      if (places.length === 0) break; // Ran out of Maps results before hitting leadLimit.

      for (const place of places) {
        if (!place.title || !place.phoneNumber || place.website) continue; // Only website-less leads are worth pitching.
        if (place.cid && query.excludeExternalIds?.has(place.cid)) continue; // Taken, or already this user's.
        if (query.minRating != null && (place.rating ?? 0) < query.minRating) continue;
        if (query.minReviews != null && (place.ratingCount ?? 0) < query.minReviews) continue;

        candidates.push({
          name: place.title,
          category: query.category,
          address: place.address ?? null,
          city: query.location,
          phone: place.phoneNumber,
          email: null,
          website: null,
          instagram: null,
          facebook: null,
          rating: place.rating ?? null,
          reviewCount: place.ratingCount ?? null,
          latitude: place.latitude ?? null,
          longitude: place.longitude ?? null,
          source: "serper",
          externalId: place.cid ?? null,
        });
        if (candidates.length >= query.leadLimit) break;
      }
    }

    const enriched: DiscoveredBusiness[] = [];
    for (let i = 0; i < candidates.length; i += 1) {
      await query.onProgress?.({ stage: "ENRICHING", completed: i, total: candidates.length });
      enriched.push(await this.enrichOne(candidates[i]!));
      if (i < candidates.length - 1) await sleep(SOCIAL_LOOKUP_DELAY_MS);
    }
    if (candidates.length > 0) {
      await query.onProgress?.({ stage: "ENRICHING", completed: candidates.length, total: candidates.length });
    }
    return enriched;
  }

  private async enrichOne(business: DiscoveredBusiness): Promise<DiscoveredBusiness> {
    const socials = await this.client
      .search(business.name)
      .then(parseSocialLinks)
      .catch(() => ({ instagram: null, facebook: null }));

    const insights = await this.enrichment.enrich({
      name: business.name,
      category: business.category,
      rating: business.rating,
      reviewCount: business.reviewCount,
    });

    return {
      ...business,
      instagram: socials.instagram,
      facebook: socials.facebook,
      insights: insights
        ? { summary: insights.summary, services: insights.services, outreachMessage: insights.outreachMessage, model: this.enrichmentModelName ?? undefined }
        : null,
    };
  }
}
