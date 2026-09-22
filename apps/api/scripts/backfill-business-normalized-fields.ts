// One-shot script: populates normalizedName/normalizedPhone/normalizedAddress/
// normalizedDomain/phoneType on every existing Business row using the Phase 2
// normalization code (lib/business/normalize.ts), meant to run once before
// the dedup engine (lib/business/dedupe.ts's resolveBusiness) starts serving
// live traffic — see the Phase 2 plan's "Rollout order" section for why
// backfilling before deploy (not after) matters: the very first live
// ingestion under the new engine needs pre-existing rows to already be
// comparable on tiers 2-4, not reachable only via the legacy exact-
// (source, externalId) tier.
//
// Idempotent — always recomputes from the existing name/phone/address/
// website columns, never invents data, safe to re-run.
//
// Re-run it after the pitch-credit release that added Business.phoneType:
// rows ingested before then have a phone and a normalizedPhone but no line
// type, and until they are classified lib/leads/phone.ts has to assume they
// are pitchable (it cannot tell "landline" from "never asked"). That
// assumption is deliberately the safe one for availability — nobody's
// existing leads vanish — but it means an unclassified landline can still
// reach the queue, fail with no_valid_phone, and refund. Backfilling ends
// that; the queue then rejects it up front instead.
//
//   npm run job:backfill-business-normalized -w apps/api

import { prisma } from "../src/lib/db/client";
import { normalizeAddress, normalizeDomain, normalizeName, normalizePhone } from "../src/lib/business/normalize";
import { classifyPhoneType } from "../src/lib/leads/phone";

const BATCH_SIZE = 500;

async function run(): Promise<number> {
  let cursor: string | undefined;
  let updated = 0;

  while (true) {
    const batch = await prisma.business.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: { id: true, name: true, phone: true, address: true, website: true },
    });
    if (batch.length === 0) break;

    for (const b of batch) {
      await prisma.business.update({
        where: { id: b.id },
        data: {
          normalizedName: normalizeName(b.name),
          normalizedPhone: normalizePhone(b.phone),
          normalizedAddress: normalizeAddress(b.address),
          normalizedDomain: normalizeDomain(b.website),
          phoneType: classifyPhoneType(b.phone),
        },
      });
      updated += 1;
    }

    cursor = batch[batch.length - 1]!.id;
  }

  return updated;
}

try {
  const updated = await run();
  console.log(`backfilled ${updated} business row(s)`);
  process.exitCode = 0;
} catch (error) {
  console.error("backfill-business-normalized-fields failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
