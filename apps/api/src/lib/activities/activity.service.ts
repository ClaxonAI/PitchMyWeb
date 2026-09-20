import type { Activity, ActivityType, Business, Campaign, Lead, Prisma, PrismaClient } from "@pitchmyweb/db";
import type { PaginatedResult } from "../campaigns/campaign.service";
import type { ActivityListQuery } from "../validation/activity";

type Db = PrismaClient | Prisma.TransactionClient;

export type RecordActivityInput = {
  leadId: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
};

/**
 * Appends a historical CRM event (backend_tasks.md section 16). Activities
 * are treated as immutable-ish: this module intentionally exposes no
 * update/delete operation, only create + read.
 */
export async function recordActivity(db: Db, input: RecordActivityInput): Promise<Activity> {
  return db.activity.create({
    data: {
      leadId: input.leadId,
      type: input.type,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function getActivityTimeline(db: Db, leadId: string): Promise<Activity[]> {
  return db.activity.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
}

export type ActivityWithLead = Activity & { lead: Lead & { business: Business; campaign: Campaign } };

// GET /api/activities (Phase 1 dashboard's Activity feed): a cross-lead
// activity feed, most-recent-first — unlike getActivityTimeline above,
// which is one lead's own chronological story. Activity has no direct
// userId/campaignId column, so ownership is scoped the same way
// lead.service.ts's listLeadsForUser scopes Lead: through the
// lead -> campaign -> userId relation chain, never fetched then filtered.
export async function listActivitiesForUser(db: PrismaClient, userId: string, query: ActivityListQuery): Promise<PaginatedResult<ActivityWithLead>> {
  const where: Prisma.ActivityWhereInput = {
    lead: {
      campaign: {
        userId,
        ...(query.campaignId ? { id: query.campaignId } : {}),
      },
      ...(query.leadId ? { id: query.leadId } : {}),
    },
  };

  const [items, total] = await Promise.all([
    db.activity.findMany({
      where,
      include: { lead: { include: { business: true, campaign: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.activity.count({ where }),
  ]);

  return { items: items as ActivityWithLead[], page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}
