import type { Prisma, PrismaClient } from "@pitchmyweb/db";

type Db = PrismaClient | Prisma.TransactionClient;

export type BusinessSourceInput = {
  businessId: string;
  source: string;
  sourceBusinessId: string | null;
  sourceUrl: string | null;
  rawData: Prisma.InputJsonValue;
};

/**
 * Writes the evidence-trail row for one provider record, regardless of
 * which cascade tier matched it (dedupe.ts::resolveBusiness calls this on
 * every ingestion). Mirrors Business's own nullable-safe upsert-vs-create
 * split: a record with no sourceBusinessId has nothing to deduplicate
 * against (Postgres treats each NULL as distinct), so it's always a plain
 * create; one with a sourceBusinessId is upserted so re-ingesting the same
 * provider record updates its raw snapshot instead of duplicating the row.
 */
export async function recordBusinessSource(db: Db, input: BusinessSourceInput): Promise<void> {
  if (input.sourceBusinessId === null) {
    await db.businessSource.create({ data: input });
    return;
  }

  await db.businessSource.upsert({
    where: { source_sourceBusinessId: { source: input.source, sourceBusinessId: input.sourceBusinessId } },
    create: input,
    update: input,
  });
}
