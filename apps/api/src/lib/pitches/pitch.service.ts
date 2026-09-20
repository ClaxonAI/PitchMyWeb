import type { Business, Lead, Pitch, Prisma, PrismaClient } from "@pitchmyweb/db";
import type { PaginatedResult } from "../campaigns/campaign.service";
import type { PitchListQuery } from "../validation/pitch";

export type PitchWithLead = Pitch & { lead: Lead & { business: Business } };

// GET /api/pitches (Phase 1 dashboard's standalone Pitches list). Pitch has
// no direct userId/campaignId column, so ownership is scoped the same way
// lead.service.ts's listLeadsForUser scopes Lead: through the
// lead -> campaign -> userId relation chain, never fetched then filtered.
export async function listPitchesForUser(db: PrismaClient, userId: string, query: PitchListQuery): Promise<PaginatedResult<PitchWithLead>> {
  const where: Prisma.PitchWhereInput = {
    lead: {
      campaign: {
        userId,
        ...(query.campaignId ? { id: query.campaignId } : {}),
      },
      ...(query.leadId ? { id: query.leadId } : {}),
    },
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    db.pitch.findMany({
      where,
      include: { lead: { include: { business: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.pitch.count({ where }),
  ]);

  return { items: items as PitchWithLead[], page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}
