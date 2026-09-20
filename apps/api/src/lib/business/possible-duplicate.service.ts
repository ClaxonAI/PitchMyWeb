import type { Business, PossibleDuplicate, PrismaClient } from "@pitchmyweb/db";
import type { PaginatedResult } from "../campaigns/campaign.service";
import type { PossibleDuplicateListQuery } from "../validation/possible-duplicate";
import { mergeBusinesses, dismissPossibleDuplicate } from "./merge";

export type PossibleDuplicateWithBusinesses = PossibleDuplicate & { business: Business; candidate: Business };

// GET /api/possible-duplicates: the Phase 2 dedup review queue. Not scoped
// to any one user — businesses aren't user-owned. Routes require an admin
// role (Phase 3).
export async function listPossibleDuplicates(db: PrismaClient, query: PossibleDuplicateListQuery): Promise<PaginatedResult<PossibleDuplicateWithBusinesses>> {
  const where = query.status ? { status: query.status } : {};

  const [items, total] = await Promise.all([
    db.possibleDuplicate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { business: true, candidate: true },
    }),
    db.possibleDuplicate.count({ where }),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
}

export async function mergePossibleDuplicateById(db: PrismaClient, id: string, resolvedBy: string, reason?: string) {
  return mergeBusinesses(db, { possibleDuplicateId: id, resolvedBy, reason });
}

export async function dismissPossibleDuplicateById(db: PrismaClient, id: string, resolvedBy: string) {
  return dismissPossibleDuplicate(db, { possibleDuplicateId: id, resolvedBy });
}
