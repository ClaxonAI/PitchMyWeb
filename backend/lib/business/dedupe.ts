import type { Prisma, PrismaClient, Business } from "../../generated/prisma/client";
import type { NormalizedBusiness } from "./normalize";

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
