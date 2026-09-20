import type { Business, Prisma, PrismaClient } from "@pitchmyweb/db";
import type { NormalizedBusiness } from "./normalize";
import { computeTrigramSimilarity, type SimilarityFn } from "./fuzzy-match";

type Db = PrismaClient | Prisma.TransactionClient;

// Tiers 2-4 of the dedup cascade (dedupe.ts::resolveBusiness). Every lookup
// here excludes merged-away rows (mergedIntoId IS NULL) — a business that
// has been superseded is never a valid match target.

export async function findExactPhoneMatch(db: Db, normalizedPhone: string | null): Promise<Business | null> {
  if (normalizedPhone === null) return null;
  return db.business.findFirst({ where: { normalizedPhone, mergedIntoId: null } });
}

export async function findExactDomainMatch(db: Db, normalizedDomain: string | null): Promise<Business | null> {
  if (normalizedDomain === null) return null;
  return db.business.findFirst({ where: { normalizedDomain, mergedIntoId: null } });
}

export async function findExactNameCityMatch(db: Db, normalizedName: string, city: string | null): Promise<Business | null> {
  if (city === null) return null;
  return db.business.findFirst({ where: { normalizedName, city, mergedIntoId: null } });
}

// A low floor, not the fuzzy-match threshold (Settings key
// dedupe.fuzzyThreshold) — this only asks "is there *any* plausible
// relationship between these two names", not "are these confidently the
// same business". The fuzzy cascade tier is what makes that stronger claim.
const CORROBORATION_NAME_SIMILARITY_FLOOR = 0.35;

/**
 * "Corroboration" for an uncorroborated-phone/domain match (tiers 2/3): a
 * similar name OR an equal, non-null city. Without either, a shared
 * phone/domain is flagged for human review unconditionally rather than
 * silently attached — franchises and shared front-desk numbers are common
 * enough that a bare match is real evidence of *something*, but never
 * enough alone.
 */
export async function isCorroborated(db: Db, candidate: NormalizedBusiness, existing: Business, similarity: SimilarityFn = computeTrigramSimilarity): Promise<boolean> {
  if (candidate.city !== null && existing.city !== null && candidate.city === existing.city) return true;
  if (candidate.normalizedName === null || existing.normalizedName === null) return false;
  const score = await similarity(db, candidate.normalizedName, existing.normalizedName);
  return score >= CORROBORATION_NAME_SIMILARITY_FLOOR;
}
