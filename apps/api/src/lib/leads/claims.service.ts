import type { Prisma, PrismaClient } from "@pitchmyweb/db";

// Business exclusivity: once one user pitches a business, no other user is
// shown it, can select it, or can message it, for EXCLUSIVE_DAYS.
//
// The row per business (BusinessClaim, unique on businessId) is written at
// three moments, all inside the transactions that already decide a pitch's
// fate, so a claim can never disagree with the credit it belongs to:
//
//   reserve  - when a pitch starts (startPipelines, claimReplacementLead).
//              Atomic: two users racing for one business end with one winner.
//   confirm  - when its credit is CONSUMED (the pitch was sent): 90 days.
//   release  - when its credit is REFUNDED or REPLACED: back to everyone.
//
// Nothing here ever tells a user *who* holds a business. A taken business
// simply does not appear, and counts leave it out.

export const EXCLUSIVE_DAYS = 90;
/** Safety net for a reservation whose pitch never resolves (it normally resolves within hours). */
export const RESERVATION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Claims `businessId` for `userId`, or returns false when another user holds
 * a live claim. A user's own claim is kept as it is (re-pitching one's own
 * business is governed by the per-user repeat protection elsewhere).
 */
export async function reserveBusiness(db: Db, input: { businessId: string; userId: string; campaignId: string; now?: Date }): Promise<boolean> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_DAYS * DAY_MS);
  // One statement, so the check and the write cannot interleave with another
  // user's: the insert wins outright, or the update only takes over a claim
  // that is released or expired; an existing live claim of this same user
  // is left untouched but still counts as success.
  const rows = await db.$queryRaw<Array<{ userId: string }>>`
    INSERT INTO "business_claims" ("id", "businessId", "userId", "campaignId", "status", "claimedAt", "expiresAt", "updatedAt")
    VALUES (${`bc_${cryptoId()}`}, ${input.businessId}, ${input.userId}, ${input.campaignId}, 'RESERVED', ${now}, ${expiresAt}, ${now})
    ON CONFLICT ("businessId") DO UPDATE SET
      "userId" = EXCLUDED."userId",
      "campaignId" = EXCLUDED."campaignId",
      "status" = 'RESERVED',
      "claimedAt" = EXCLUDED."claimedAt",
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "business_claims"."status" = 'RELEASED' OR "business_claims"."expiresAt" <= ${now}
    RETURNING "userId"`;
  if (rows.length === 1) return true;
  const existing = await db.businessClaim.findUnique({ where: { businessId: input.businessId }, select: { userId: true } });
  return existing?.userId === input.userId;
}

/** The pitch was sent: the business is this user's for EXCLUSIVE_DAYS. */
export async function confirmBusinessClaim(db: Db, input: { businessId: string; userId: string; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  await db.businessClaim.updateMany({
    where: { businessId: input.businessId, userId: input.userId },
    data: { status: "PITCHED", expiresAt: new Date(now.getTime() + EXCLUSIVE_DAYS * DAY_MS) },
  });
}

/** The pitch did not go out: the business is free again, unless this user already pitched it before. */
export async function releaseBusinessClaim(db: Db, input: { businessId: string; userId: string; campaignId: string }): Promise<void> {
  await db.businessClaim.updateMany({
    where: { businessId: input.businessId, userId: input.userId, campaignId: input.campaignId, status: "RESERVED" },
    data: { status: "RELEASED" },
  });
}

/** Of `businessIds`, those another user holds a live claim on. */
export async function businessesTakenByOthers(db: Db, userId: string, businessIds: readonly string[], now = new Date()): Promise<Set<string>> {
  if (businessIds.length === 0) return new Set();
  const claims = await db.businessClaim.findMany({
    where: { businessId: { in: [...businessIds] }, userId: { not: userId }, status: { in: ["RESERVED", "PITCHED"] }, expiresAt: { gt: now } },
    select: { businessId: true },
  });
  return new Set(claims.map((claim) => claim.businessId));
}

/**
 * Provider ids (e.g. Google Maps cids) the discovery worker should skip for
 * a search in `location`: businesses other users hold, and businesses this
 * user was already given. Skipping them at the source keeps them from using
 * up the search budget and the per-business enrichment calls.
 */
export async function excludedExternalIds(
  db: Db,
  input: { userId: string; source: string; location: string; limit?: number },
  now = new Date(),
): Promise<string[]> {
  const limit = input.limit ?? 5_000;
  const city = { equals: input.location.trim(), mode: "insensitive" as const };
  const [claimed, seen] = await Promise.all([
    db.businessClaim.findMany({
      where: {
        userId: { not: input.userId },
        status: { in: ["RESERVED", "PITCHED"] },
        expiresAt: { gt: now },
        business: { source: input.source, city, externalId: { not: null } },
      },
      select: { business: { select: { externalId: true } } },
      take: limit,
    }),
    db.lead.findMany({
      where: { campaign: { userId: input.userId }, business: { source: input.source, city, externalId: { not: null } } },
      select: { business: { select: { externalId: true } } },
      take: limit,
    }),
  ]);
  const ids = new Set<string>();
  for (const row of [...claimed, ...seen]) if (row.business.externalId) ids.add(row.business.externalId);
  return [...ids];
}

function cryptoId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}
