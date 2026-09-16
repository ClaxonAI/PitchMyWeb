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
};

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
  };
}
