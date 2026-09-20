import type { WebsiteRequirement } from "@pitchmyweb/db";
import type { BusinessProviderInput } from "../validation/business";

// Single authoritative definition of "does this business satisfy this
// campaign's filters" (backend_tasks.md section 5.2 validation fields).
// Used in two places, deliberately:
//
//   1. DemoProvider.search() — representing a real provider's own
//      server-side filtering (a real BusinessAPIProvider would filter
//      before returning results, the same way this one does).
//   2. run.service.ts's ingestion loop — as an independent, defense-in-depth
//      re-check on whatever a provider actually returns. The execution
//      service must not assume a provider filtered correctly (a future
//      provider might filter imperfectly, or not at all); "the final
//      persisted leads must satisfy the campaign's filters" is the
//      execution service's own responsibility, not something it can
//      delegate entirely to whichever LeadProvider happens to be plugged
//      in. Defining the predicate once here and importing it in both
//      places avoids maintaining two copies of the same filter logic.
export type CampaignFilterCriteria = {
  location: string;
  category: string;
  minRating?: number | null;
  minReviews?: number | null;
  websiteRequirement: WebsiteRequirement;
};

const containsCaseInsensitive = (haystack: string | null | undefined, needle: string): boolean => (haystack ?? "").toLowerCase().includes(needle.trim().toLowerCase());

function matchesLocation(business: BusinessProviderInput, location: string): boolean {
  const needle = location.trim();
  if (needle.length === 0) return true;
  return containsCaseInsensitive(business.city, needle) || containsCaseInsensitive(business.address, needle);
}

function matchesCategory(business: BusinessProviderInput, category: string): boolean {
  return containsCaseInsensitive(business.category, category);
}

function matchesRating(business: BusinessProviderInput, minRating: number | null | undefined): boolean {
  if (minRating === null || minRating === undefined) return true;
  return (business.rating ?? 0) >= minRating;
}

function matchesReviews(business: BusinessProviderInput, minReviews: number | null | undefined): boolean {
  if (minReviews === null || minReviews === undefined) return true;
  return (business.reviewCount ?? 0) >= minReviews;
}

// backend_tasks.md section 5.2/9: WebsiteRequirement semantics, unchanged
// from Phase 2/3/4 — ANY imposes no constraint, WITH_WEBSITE requires a
// non-empty website URL on file, WITHOUT_WEBSITE requires the opposite.
// "Poor"/outdated websites are out of scope here: nothing in the Business
// record can currently distinguish a poor website from a good one (no
// inspection/enrichment data exists yet — see lib/scoring/scoring.ts's own
// documented websiteGap limitation), so WITH_WEBSITE only ever checks
// presence, never quality.
export function matchesWebsiteRequirement(business: BusinessProviderInput, requirement: WebsiteRequirement): boolean {
  if (requirement === "WITH_WEBSITE") return business.website !== null && business.website !== undefined && business.website.trim().length > 0;
  if (requirement === "WITHOUT_WEBSITE") return !business.website || business.website.trim().length === 0;
  return true;
}

/**
 * Note on `radius`: campaign filter criteria intentionally excludes it.
 * Campaign.location is free text (no stored coordinate), and V1 has no
 * geocoding capability (explicitly out of scope — no external APIs). A
 * real distance-radius filter needs a reference point to measure from;
 * without one, evaluating `radius` here would mean either silently
 * ignoring it (dishonest — looks like it's doing something) or fabricating
 * a distance calculation with no real geographic meaning. `location` is
 * still honored as a text match (city/address substring) so campaigns can
 * meaningfully target a place; `radius` is accepted by CampaignSearchInput
 * for interface completeness (a future geocoding-capable provider can use
 * it) but is not evaluated by this deterministic, geocoding-free filter.
 * Documented Rule-10 assumption — see the Phase 4 follow-up report.
 */
export function matchesCampaignFilters(business: BusinessProviderInput, criteria: CampaignFilterCriteria): boolean {
  return (
    matchesCategory(business, criteria.category) &&
    matchesLocation(business, criteria.location) &&
    matchesRating(business, criteria.minRating) &&
    matchesReviews(business, criteria.minReviews) &&
    matchesWebsiteRequirement(business, criteria.websiteRequirement)
  );
}
