// Shape the worker reports to apps/api's POST /api/internal/pipeline/
// discovery-results — a local, hand-maintained mirror of apps/api's
// businessProviderInputSchema (lib/validation/business.ts), not an import
// from it: apps/discovery-worker is a separate app in this monorepo and,
// like every other producer/consumer pair here (BullMQ job payloads), the
// two sides validate independently rather than sharing a schema package.
// The API re-validates this shape for real; getting a field wrong here
// fails loudly there, not silently here.
export type DiscoveredBusiness = {
  name: string;
  category: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  externalId: string | null;
  // Optional AI-generated enrichment (mirrors apps/api's discoveryInsightsSchema
  // in lib/validation/business.ts). Only a source that itself calls an LLM
  // (currently SerperSource) ever sets this; apps/api re-validates and
  // sanitizes it on ingest, so a malformed object here is safe to send —
  // it's dropped there, never fatal.
  insights?: {
    summary?: string;
    services?: string[];
    outreachMessage?: string;
    model?: string;
  } | null;
};

export type DiscoveryQuery = {
  location: string;
  category: string;
  radius: number | null;
  minRating: number | null;
  minReviews: number | null;
  leadLimit: number;
  /**
   * Provider ids to leave out: businesses another PitchMyWeb user holds, or
   * this user already has. Skipped as they are found, so they use up neither
   * the search budget nor an enrichment call.
   */
  excludeExternalIds?: ReadonlySet<string>;
  onProgress?: (event: { stage: "GEOCODING" } | { stage: "SEARCHING" } | { stage: "ENRICHING"; completed: number; total: number }) => Promise<void> | void;
};

/**
 * The swappable discovery boundary: crawl.ts/process-discovery.ts depend
 * only on this interface, never on Overpass/Nominatim specifics directly.
 * A future licensed/paid data source is just a second implementation,
 * selected the same way LEAD_PROVIDER selects between apps/api's providers.
 */
export interface BusinessDiscoverySource {
  search(query: DiscoveryQuery): Promise<DiscoveredBusiness[]>;
}
