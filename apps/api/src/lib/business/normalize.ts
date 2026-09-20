import { parsePhoneNumberWithError, type CountryCode } from "libphonenumber-js";
import type { BusinessProviderInput } from "../validation/business";

export type NormalizedBusiness = {
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
  // Phase 2 dedup engine (lib/business/matching.ts, fuzzy-match.ts): lowercased/
  // collapsed forms used by the matching cascade. Independent of the fields
  // above — those stay display-quality (original casing/punctuation), these
  // exist purely for comparison.
  normalizedName: string | null;
  normalizedPhone: string | null;
  normalizedAddress: string | null;
  normalizedDomain: string | null;
};

// Company-suffix noise that would otherwise make two names that are
// genuinely the same business score as different — fixed, documented list,
// not an attempt at exhaustive legal-entity parsing.
const NAME_SUFFIX_PATTERN = /\b(pvt\.?\s*ltd\.?|private\s+limited|llp|llc|inc\.?|ltd\.?)\b/gi;

/**
 * Lowercased, whitespace-collapsed, legal-suffix-stripped form of a
 * business name, used for exact name+city matching (tier 4) and as the
 * trigram input for fuzzy matching (tier 5).
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(NAME_SUFFIX_PATTERN, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * E.164 form of a phone number, or null if it can't be parsed as a valid
 * number at all (never invents a number, never guesses a country from
 * nothing). `defaultRegion` covers numbers written without a country code —
 * PitchMyWeb's primary market is India, so IN is the default, matching the
 * checkout flow's own India-first pricing convention.
 */
export function normalizePhone(phone: string | null, defaultRegion: CountryCode = "IN"): string | null {
  if (phone === null) return null;
  try {
    const parsed = parsePhoneNumberWithError(phone, defaultRegion);
    return parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

/**
 * Lowercased, whitespace/punctuation-collapsed form of an address, used as
 * the trigram input for fuzzy address matching (tier 5). Deliberately not a
 * full address-parsing library — this only needs to make "12 MG Road" and
 * "12, M.G. Road" compare as near-identical, not resolve real addresses.
 */
export function normalizeAddress(address: string | null): string | null {
  if (address === null) return null;
  const cleaned = address
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Registrable-ish domain extracted from a website URL, lowercased with a
 * leading "www." stripped — "https://www.Example.com/menu" and
 * "http://example.com" both normalize to "example.com". Null for anything
 * that doesn't parse as a URL at all, rather than guessing.
 */
export function normalizeDomain(website: string | null): string | null {
  if (website === null) return null;
  try {
    const url = new URL(website);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const collapseWhitespace = (value: string): string => value.trim().replace(/\s+/g, " ");

const nullableText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = collapseWhitespace(value);
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Normalizes a raw provider business record into the deterministic shape
 * persisted as a canonical Business (backend_tasks.md section 6/22). This
 * never invents missing data — every field is either derived from the
 * input via a fixed, documented rule or passed through as null.
 *
 * Rules:
 * - name/category/address/city: trimmed, internal whitespace collapsed.
 * - email: additionally lowercased (case-insensitive by convention).
 * - source: additionally lowercased, since it is half of the
 *   source+externalId dedup key (backend_tasks.md section 6) and
 *   "Demo" vs "demo" must not be treated as different providers.
 * - externalId: trimmed only, case preserved — providers may issue
 *   case-sensitive identifiers.
 * - rating: rounded to 1 decimal place, clamped to [0, 5].
 * - reviewCount: floored to an integer, clamped to >= 0.
 * - website/instagram/facebook/phone: trimmed only.
 */
export function normalizeBusinessInput(input: BusinessProviderInput): NormalizedBusiness {
  return {
    name: collapseWhitespace(input.name),
    category: collapseWhitespace(input.category),
    address: nullableText(input.address ?? null),
    city: nullableText(input.city ?? null),
    phone: nullableText(input.phone ?? null),
    email: nullableText(input.email ?? null)?.toLowerCase() ?? null,
    website: nullableText(input.website ?? null),
    instagram: nullableText(input.instagram ?? null),
    facebook: nullableText(input.facebook ?? null),
    rating: input.rating === null || input.rating === undefined ? null : Math.min(5, Math.max(0, Math.round(input.rating * 10) / 10)),
    reviewCount: input.reviewCount === null || input.reviewCount === undefined ? null : Math.max(0, Math.floor(input.reviewCount)),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    source: collapseWhitespace(input.source).toLowerCase(),
    externalId: nullableText(input.externalId ?? null),
    normalizedName: normalizeName(input.name),
    normalizedPhone: normalizePhone(nullableText(input.phone ?? null)),
    normalizedAddress: normalizeAddress(nullableText(input.address ?? null)),
    normalizedDomain: normalizeDomain(nullableText(input.website ?? null)),
  };
}
