import { contactChannelCount, hasWebsite, socialPresenceCount, type BusinessSignalFields } from "../business/signals";

// Deterministic opportunity scoring (backend_tasks.md section 9). The AI
// never computes or influences this — every signal is a fixed function of
// data already present on the Business/Lead record.
//
// The README fixes the *point allocations* and the *classification bands*
// but not the raw-value normalization formula for every signal. Where a
// formula had to be chosen, it is documented immediately above the
// relevant constant/function below, and the thresholds are pulled into
// named constants at the top of each section so they are easy to find and
// change without touching the calculation logic itself.

export const SIGNAL_MAX_POINTS = {
  rating: 15,
  reviewVolume: 15,
  websiteGap: 25,
  socialPresence: 10,
  contactAvailability: 10,
  businessValue: 10,
  localDemand: 10,
  dataQuality: 5,
} as const;

export type OpportunitySignals = {
  rating: number;
  reviewVolume: number;
  websiteGap: number;
  socialPresence: number;
  contactAvailability: number;
  businessValue: number;
  localDemand: number;
  dataQuality: number;
};

export type ScoreClassificationValue = "EXCELLENT" | "STRONG" | "MEDIUM" | "LOW" | "IGNORE";

export type OpportunityScore = {
  total: number;
  classification: ScoreClassificationValue;
  breakdown: OpportunitySignals;
};

export type BusinessScoringInput = BusinessSignalFields & {
  rating: number | null;
  reviewCount: number | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// --- Rating (max 15) --------------------------------------------------
// Linear scale of the 0-5 star rating onto 0-15 points. No rating on file
// earns 0 (never invent a rating the business doesn't have).
export function scoreRating(rating: number | null): number {
  if (rating === null) return 0;
  return clamp(Math.round((rating / 5) * SIGNAL_MAX_POINTS.rating), 0, SIGNAL_MAX_POINTS.rating);
}

// --- Review volume (max 15) --------------------------------------------
// Step function over reviewCount: more reviews implies a more established,
// more provably in-demand business. Tiers are a fixed lookup table
// (deterministic, trivially editable) rather than a continuous log curve.
const REVIEW_VOLUME_TIERS: Array<{ min: number; points: number }> = [
  { min: 151, points: 15 },
  { min: 51, points: 11 },
  { min: 11, points: 7 },
  { min: 1, points: 3 },
  { min: 0, points: 0 },
];

export function scoreReviewVolume(reviewCount: number | null): number {
  const count = reviewCount ?? 0;
  const tier = REVIEW_VOLUME_TIERS.find((t) => count >= t.min);
  return tier?.points ?? 0;
}

// --- Website gap (max 25) ----------------------------------------------
// The single heaviest signal: no website at all is the core opportunity
// this product sells against, so it earns full credit. Detecting an
// existing-but-outdated website requires inspection/enrichment data that
// does not exist yet in the Business record (that pipeline is a later
// phase) — full credit is withheld once any website URL is on file rather
// than guessing at its quality.
export function scoreWebsiteGap(hasSite: boolean): number {
  return hasSite ? 0 : SIGNAL_MAX_POINTS.websiteGap;
}

// --- Social presence (max 10) -------------------------------------------
// Rewards *having* an active social presence (Instagram/Facebook), read as
// a proxy for digital engagement/reachability, not as a gap to fill.
const SOCIAL_PRESENCE_POINTS: Record<0 | 1 | 2, number> = { 0: 0, 1: 6, 2: 10 };

export function scoreSocialPresence(count: 0 | 1 | 2): number {
  return SOCIAL_PRESENCE_POINTS[count];
}

// --- Contact availability (max 10) --------------------------------------
// Rewards having at least one, ideally both, of phone/email on file —
// outreach is impossible without them.
const CONTACT_AVAILABILITY_POINTS: Record<0 | 1 | 2, number> = { 0: 0, 1: 6, 2: 10 };

export function scoreContactAvailability(count: 0 | 1 | 2): number {
  return CONTACT_AVAILABILITY_POINTS[count];
}

// --- Business value (max 10) --------------------------------------------
// Proxy for deal-size potential. The Business record has no revenue or
// employee-count data, so reviewCount is reused as a coarse scale proxy
// (more reviews ~ more customer volume ~ more likely to afford a larger
// package) using a coarser 3-tier table, distinct from the review-volume
// signal's 5-tier table above, since the two signals measure different
// things (discoverability vs. likely deal size) even from the same field.
const BUSINESS_VALUE_TIERS: Array<{ min: number; points: number }> = [
  { min: 101, points: 10 },
  { min: 11, points: 7 },
  { min: 0, points: 3 },
];

export function scoreBusinessValue(reviewCount: number | null): number {
  const count = reviewCount ?? 0;
  const tier = BUSINESS_VALUE_TIERS.find((t) => count >= t.min);
  return tier?.points ?? 0;
}

// --- Local demand (max 10) ----------------------------------------------
// No local-market-demand data source exists yet (would need competitor
// density / search-volume enrichment from a future provider integration).
// Rather than inventing a formula from data that doesn't exist, this
// signal defaults to a neutral half-credit constant until such a data
// source is added — a single constant is trivial to replace later. One
// consequence: until that data source exists, the practical ceiling for
// calculateOpportunityScore() is 95/100, not 100/100 — every other signal
// can independently reach its max, but this one cannot yet reach its 10.
const LOCAL_DEMAND_DEFAULT_POINTS = 5;

export function scoreLocalDemand(): number {
  return LOCAL_DEMAND_DEFAULT_POINTS;
}

// --- Data quality (max 5) ------------------------------------------------
// Rewards how complete the canonical Business record is, independent of
// what the values are.
const DATA_QUALITY_FIELDS = ["address", "city", "phone", "email", "rating", "reviewCount", "latitude", "longitude"] as const;

export function scoreDataQuality(input: BusinessScoringInput): number {
  const filled = DATA_QUALITY_FIELDS.filter((field) => {
    const value = input[field as keyof BusinessScoringInput];
    return value !== null && value !== undefined && value !== "";
  }).length;
  return clamp(Math.round((filled / DATA_QUALITY_FIELDS.length) * SIGNAL_MAX_POINTS.dataQuality), 0, SIGNAL_MAX_POINTS.dataQuality);
}

export function calculateOpportunitySignals(input: BusinessScoringInput): OpportunitySignals {
  return {
    rating: scoreRating(input.rating),
    reviewVolume: scoreReviewVolume(input.reviewCount),
    websiteGap: scoreWebsiteGap(hasWebsite(input)),
    socialPresence: scoreSocialPresence(socialPresenceCount(input)),
    contactAvailability: scoreContactAvailability(contactChannelCount(input)),
    businessValue: scoreBusinessValue(input.reviewCount),
    localDemand: scoreLocalDemand(),
    dataQuality: scoreDataQuality(input),
  };
}

export function classifyScore(total: number): ScoreClassificationValue {
  if (total >= 90) return "EXCELLENT";
  if (total >= 75) return "STRONG";
  if (total >= 60) return "MEDIUM";
  if (total >= 40) return "LOW";
  return "IGNORE";
}

export function calculateOpportunityScore(input: BusinessScoringInput): OpportunityScore {
  const breakdown = calculateOpportunitySignals(input);
  const rawTotal = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  const total = clamp(rawTotal, 0, 100);
  return { total, classification: classifyScore(total), breakdown };
}
