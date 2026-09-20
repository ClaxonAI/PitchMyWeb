import type { Prisma, PrismaClient, Business } from "@pitchmyweb/db";
import type { NormalizedBusiness } from "./normalize";
import { findExactPhoneMatch, findExactDomainMatch, findExactNameCityMatch, isCorroborated } from "./matching";
import { pgTrgmFuzzyMatcher } from "./fuzzy-match";
import { recordBusinessSource } from "./business-source";
import { getDedupeFuzzyConfig } from "../settings/settings.service";
import { isUniqueConstraintViolation } from "../errors";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Persists a normalized business record as the canonical Business row,
 * deduplicating on source+externalId (backend_tasks.md section 6).
 *
 * This is application-level dedup that *relies on* the database unique
 * constraint from Phase 1 (`@@unique([source, externalId])`) rather than
 * replacing it: the upsert below compiles to an atomic
 * `INSERT ... ON CONFLICT DO UPDATE`, so two concurrent calls for the same
 * (source, externalId) cannot race into two rows — Postgres serializes
 * them, not application memory (section 22/37: "Do not rely on in-memory
 * state for deduplication").
 *
 * When the provider supplies no externalId there is nothing to
 * deduplicate against (per the documented rule, the dedup key only
 * applies once an externalId is known), so a plain create is used.
 *
 * Tier 1 of the Phase 2 cascade (resolveBusiness, below) — kept as its own
 * function since it's also used standalone by callers that only ever have
 * one discovery source and don't need the full cascade (none today, but
 * this preserves the pre-Phase-2 behavior for anything not yet migrated).
 */
export async function upsertCanonicalBusiness(db: Db, business: NormalizedBusiness): Promise<Business> {
  if (business.externalId === null) {
    return db.business.create({ data: business });
  }

  return db.business.upsert({
    where: {
      source_externalId: {
        source: business.source,
        externalId: business.externalId,
      },
    },
    create: business,
    update: business,
  });
}

export type Provenance = {
  source: string;
  sourceBusinessId: string | null;
  sourceUrl: string | null;
  rawData: Prisma.InputJsonValue;
};

export type FlagReason = "EXACT_PHONE_UNCORROBORATED" | "EXACT_DOMAIN_UNCORROBORATED" | "FUZZY_THRESHOLD";

export type ResolveBusinessResult = { business: Business; flaggedVia: FlagReason | null };

/**
 * Flags an unordered (existing, candidate) pair for human review, unless
 * that exact pair has already been flagged in either order — enforced both
 * here (a findFirst check across both orderings) and by the database's
 * expression unique index on possible_duplicates (LEAST/GREATEST), which is
 * what actually closes the race between two concurrent ingestions that both
 * pass this check before either commits.
 */
async function flagPossibleDuplicate(
  tx: Prisma.TransactionClient,
  existing: Business,
  candidate: Business,
  score: number,
  matchedFields: Prisma.InputJsonObject,
): Promise<void> {
  const alreadyFlagged = await tx.possibleDuplicate.findFirst({
    where: {
      OR: [
        { businessId: existing.id, candidateId: candidate.id },
        { businessId: candidate.id, candidateId: existing.id },
      ],
    },
  });
  if (alreadyFlagged) return;

  try {
    await tx.possibleDuplicate.create({
      data: { businessId: existing.id, candidateId: candidate.id, score, matchedFields },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return;
    throw error;
  }
}

/**
 * The full Phase 2 matching cascade (see the plan doc's "Cascade" section
 * for the approved tier order — this implements it exactly, not a
 * reinterpretation):
 *
 *   1. Exact (source, externalId)              -> attach                [Tier 1, upsertCanonicalBusiness]
 *   2. Exact normalized phone + corroboration   -> attach if corroborated, else unconditional PENDING review
 *   3. Exact normalized domain + corroboration  -> attach if corroborated, else unconditional PENDING review
 *   4. Exact normalized name + city             -> attach
 *   5. Fuzzy candidate search (thresholded)     -> PENDING review if >= threshold, else ignored
 *   6. No match                                 -> create new, no review
 *
 * `mergedIntoId IS NOT NULL` businesses are excluded from every tier's
 * lookup (matching.ts/fuzzy-match.ts's own queries). PossibleDuplicate.
 * businessId is always the pre-existing/canonical match; candidateId is the
 * newly-flagged incoming record — lib/business/merge.ts relies on this
 * ordering to know which side is the winner.
 *
 * Must run inside a transaction the caller already owns (it takes a
 * Postgres advisory lock, which is transaction-scoped — released
 * automatically when that transaction ends). ingestBusinessAsLead is the
 * one production caller, and already wraps this together with lead creation
 * in a single `db.$transaction`, so business resolution and lead creation
 * commit atomically. Closing this race window is exactly why there's no
 * hard unique constraint on normalizedPhone/normalizedDomain instead — a
 * hard constraint would wrongly reject legitimately distinct businesses
 * that happen to share a number, e.g. franchises on one shared front desk.
 */
export async function resolveBusiness(tx: Prisma.TransactionClient, normalized: NormalizedBusiness, provenance: Provenance): Promise<ResolveBusinessResult> {
  // Tier 1: unchanged, existing behavior.
  if (normalized.externalId !== null) {
    const existing = await tx.business.findUnique({
      where: { source_externalId: { source: normalized.source, externalId: normalized.externalId } },
    });
    if (existing) {
      await recordBusinessSource(tx, { businessId: existing.id, ...provenance });
      return { business: existing, flaggedVia: null };
    }
  }

  const lockKey = normalized.normalizedPhone ?? normalized.normalizedDomain;
  if (lockKey !== null) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }

  // Tier 2: exact phone.
  const phoneMatch = await findExactPhoneMatch(tx, normalized.normalizedPhone);
  if (phoneMatch) {
    if (await isCorroborated(tx, normalized, phoneMatch)) {
      await recordBusinessSource(tx, { businessId: phoneMatch.id, ...provenance });
      return { business: phoneMatch, flaggedVia: null };
    }
    const created = await upsertCanonicalBusiness(tx, normalized);
    await recordBusinessSource(tx, { businessId: created.id, ...provenance });
    await flagPossibleDuplicate(tx, phoneMatch, created, 0, { flaggedVia: "EXACT_PHONE_UNCORROBORATED", normalizedPhone: normalized.normalizedPhone });
    return { business: created, flaggedVia: "EXACT_PHONE_UNCORROBORATED" };
  }

  // Tier 3: exact domain.
  const domainMatch = await findExactDomainMatch(tx, normalized.normalizedDomain);
  if (domainMatch) {
    if (await isCorroborated(tx, normalized, domainMatch)) {
      await recordBusinessSource(tx, { businessId: domainMatch.id, ...provenance });
      return { business: domainMatch, flaggedVia: null };
    }
    const created = await upsertCanonicalBusiness(tx, normalized);
    await recordBusinessSource(tx, { businessId: created.id, ...provenance });
    await flagPossibleDuplicate(tx, domainMatch, created, 0, { flaggedVia: "EXACT_DOMAIN_UNCORROBORATED", normalizedDomain: normalized.normalizedDomain });
    return { business: created, flaggedVia: "EXACT_DOMAIN_UNCORROBORATED" };
  }

  // Tier 4: exact name+city.
  if (normalized.normalizedName !== null) {
    const nameCityMatch = await findExactNameCityMatch(tx, normalized.normalizedName, normalized.city);
    if (nameCityMatch) {
      await recordBusinessSource(tx, { businessId: nameCityMatch.id, ...provenance });
      return { business: nameCityMatch, flaggedVia: null };
    }
  }

  // Tier 5: fuzzy candidate search — generates review candidates only,
  // never determines identity by itself.
  const candidates = await pgTrgmFuzzyMatcher.findFuzzyCandidates(tx, normalized);
  const { threshold } = await getDedupeFuzzyConfig(tx);
  const best = candidates[0];
  if (best && best.combinedScore >= threshold) {
    const created = await upsertCanonicalBusiness(tx, normalized);
    await recordBusinessSource(tx, { businessId: created.id, ...provenance });
    await flagPossibleDuplicate(tx, best.business, created, best.combinedScore, {
      flaggedVia: "FUZZY_THRESHOLD",
      nameScore: best.nameScore,
      addressScore: best.addressScore,
      phoneBonus: best.phoneBonus,
      domainBonus: best.domainBonus,
      combinedScore: best.combinedScore,
    });
    return { business: created, flaggedVia: "FUZZY_THRESHOLD" };
  }

  // Tier 6: no match.
  const created = await upsertCanonicalBusiness(tx, normalized);
  await recordBusinessSource(tx, { businessId: created.id, ...provenance });
  return { business: created, flaggedVia: null };
}
