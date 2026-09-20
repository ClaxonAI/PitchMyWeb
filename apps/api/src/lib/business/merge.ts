import type { Business, BusinessMerge, Prisma, PrismaClient, PossibleDuplicate } from "@pitchmyweb/db";
import { ConflictError, NotFoundError } from "../errors";

type Db = PrismaClient | Prisma.TransactionClient;

export type MergeBusinessesInput = {
  possibleDuplicateId: string;
  resolvedBy: string;
  reason?: string;
};

export type MergeBusinessesResult = { winner: Business; loser: Business; merge: BusinessMerge };

/**
 * Confirms a PossibleDuplicate as a real duplicate: reassigns the loser's
 * leads onto the winner where possible, marks the loser mergedIntoId (never
 * deleted — Lead.business stays onDelete: Restrict), and records a
 * permanent BusinessMerge audit row. `businessId` is always the winner
 * (pre-existing/canonical) and `candidateId` the loser (newly-flagged) —
 * see dedupe.ts::resolveBusiness's own comment on why that ordering is
 * fixed, not a per-merge choice.
 */
export async function mergeBusinesses(db: PrismaClient, input: MergeBusinessesInput): Promise<MergeBusinessesResult> {
  return db.$transaction(async (tx) => {
    const possibleDuplicate = await tx.possibleDuplicate.findUnique({ where: { id: input.possibleDuplicateId } });
    if (!possibleDuplicate) throw new NotFoundError("PossibleDuplicate", input.possibleDuplicateId);
    if (possibleDuplicate.status !== "PENDING") {
      throw new ConflictError(`Possible duplicate ${possibleDuplicate.id} has already been resolved (${possibleDuplicate.status})`);
    }

    const winnerId = possibleDuplicate.businessId;
    const loserId = possibleDuplicate.candidateId;

    const loserLeads = await tx.lead.findMany({ where: { businessId: loserId } });
    for (const lead of loserLeads) {
      const collision = await tx.lead.findUnique({
        where: { campaignId_businessId: { campaignId: lead.campaignId, businessId: winnerId } },
      });
      // If the winner already has a Lead in this campaign, the loser's Lead
      // stays exactly where it is (on the now-mergedIntoId-flagged loser
      // business) rather than being silently dropped to avoid the
      // @@unique([campaignId, businessId]) collision — its activities/
      // scores/pitches all stay intact, just attached to a business that is
      // now marked as superseded instead of canonical.
      if (!collision) {
        await tx.lead.update({ where: { id: lead.id }, data: { businessId: winnerId } });
      }
    }

    const loser = await tx.business.update({ where: { id: loserId }, data: { mergedIntoId: winnerId } });
    const winner = await tx.business.findUniqueOrThrow({ where: { id: winnerId } });

    const merge = await tx.businessMerge.create({
      data: {
        winnerBusinessId: winnerId,
        loserBusinessId: loserId,
        resolvedBy: input.resolvedBy,
        reason: input.reason ?? null,
        possibleDuplicateId: possibleDuplicate.id,
      },
    });

    await tx.possibleDuplicate.update({
      where: { id: possibleDuplicate.id },
      data: { status: "CONFIRMED_MERGED", resolvedAt: new Date(), resolvedBy: input.resolvedBy },
    });

    return { winner, loser, merge };
  });
}

export type DismissPossibleDuplicateInput = { possibleDuplicateId: string; resolvedBy: string };

/**
 * Dismisses a PossibleDuplicate as not actually a duplicate. Idempotent for
 * a repeat dismiss of the same review (returns it unchanged rather than
 * erroring) — but dismissing one that's already been merged is a genuine
 * conflict, since a merge can't be undone by dismissing the review that led
 * to it.
 */
export async function dismissPossibleDuplicate(db: Db, input: DismissPossibleDuplicateInput): Promise<PossibleDuplicate> {
  const possibleDuplicate = await db.possibleDuplicate.findUnique({ where: { id: input.possibleDuplicateId } });
  if (!possibleDuplicate) throw new NotFoundError("PossibleDuplicate", input.possibleDuplicateId);
  if (possibleDuplicate.status === "DISMISSED") return possibleDuplicate;
  if (possibleDuplicate.status === "CONFIRMED_MERGED") {
    throw new ConflictError(`Possible duplicate ${possibleDuplicate.id} has already been merged`);
  }

  return db.possibleDuplicate.update({
    where: { id: possibleDuplicate.id },
    data: { status: "DISMISSED", resolvedAt: new Date(), resolvedBy: input.resolvedBy },
  });
}
