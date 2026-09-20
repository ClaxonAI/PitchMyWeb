import type { Business, Prisma, PrismaClient } from "@pitchmyweb/db";
import type { NormalizedBusiness } from "./normalize";
import { getDedupeFuzzyConfig } from "../settings/settings.service";

type Db = PrismaClient | Prisma.TransactionClient;

// The one Postgres-pg_trgm-specific module in the dedup engine — isolated
// behind these two injectable functions so every *other* file in
// lib/business/ can be unit-tested with a fake Prisma client. Only
// fuzzy-match.integration.test.ts talks to a real Postgres database.

export type SimilarityFn = (db: Db, a: string, b: string) => Promise<number>;

/** Raw trigram similarity between two arbitrary strings, via Postgres's own similarity(). */
export async function computeTrigramSimilarity(db: Db, a: string, b: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ score: number }>>`SELECT similarity(${a}, ${b}) AS score`;
  return rows[0]?.score ?? 0;
}

export type FuzzyCandidate = {
  business: Business;
  nameScore: number;
  addressScore: number;
  phoneBonus: number;
  domainBonus: number;
  combinedScore: number;
};

export interface FuzzyMatcher {
  findFuzzyCandidates(db: Db, normalized: NormalizedBusiness, limit?: number): Promise<FuzzyCandidate[]>;
}

const DEFAULT_CANDIDATE_LIMIT = 20;

/**
 * Finds businesses whose normalizedName/normalizedAddress are trigram-similar
 * to the incoming record, scores each with the weighted formula from
 * dedupe.fuzzyThreshold's Settings row, and returns candidates ordered by
 * combinedScore descending. Every component score is returned individually
 * (not just the combined score) so a real confirm/dismiss outcome can later
 * be used to tune the threshold instead of guessing.
 *
 * This never decides identity by itself — dedupe.ts::resolveBusiness is the
 * only caller, and only ever uses this to generate PENDING review
 * candidates, never to attach automatically.
 */
export const pgTrgmFuzzyMatcher: FuzzyMatcher = {
  async findFuzzyCandidates(db, normalized, limit = DEFAULT_CANDIDATE_LIMIT) {
    if (normalized.normalizedName === null) return [];
    const { weights } = await getDedupeFuzzyConfig(db);

    const rows = await db.$queryRaw<
      Array<Business & { nameScore: number; addressScore: number }>
    >`
      SELECT b.*,
             similarity(b."normalizedName", ${normalized.normalizedName}) AS "nameScore",
             CASE WHEN b."normalizedAddress" IS NOT NULL AND ${normalized.normalizedAddress}::text IS NOT NULL
                  THEN similarity(b."normalizedAddress", ${normalized.normalizedAddress})
                  ELSE 0 END AS "addressScore"
      FROM "businesses" b
      WHERE b."mergedIntoId" IS NULL
        AND b."normalizedName" % ${normalized.normalizedName}
      ORDER BY "nameScore" DESC
      LIMIT ${limit}
    `;

    const scored = rows.map((row) => {
      const { nameScore, addressScore, ...business } = row;
      const phoneBonus = normalized.normalizedPhone !== null && normalized.normalizedPhone === business.normalizedPhone ? 1 : 0;
      const domainBonus = normalized.normalizedDomain !== null && normalized.normalizedDomain === business.normalizedDomain ? 1 : 0;
      const combinedScore = nameScore * weights.name + addressScore * weights.address + phoneBonus * weights.phone + domainBonus * weights.domain;
      return { business: business as Business, nameScore, addressScore, phoneBonus, domainBonus, combinedScore };
    });

    // The SQL query orders by nameScore (a cheap, index-assisted proxy for
    // "worth fetching at all"); the real ranking that matters is the
    // weighted combinedScore, computed here once weights are known.
    return scored.sort((a, b) => b.combinedScore - a.combinedScore);
  },
};
