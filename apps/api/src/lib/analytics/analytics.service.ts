import type { ActivityType, PrismaClient } from "@pitchmyweb/db";

// GET /api/analytics (Phase 8, backend_tasks.md section 14): every number
// here is derived live from Postgres via Prisma aggregation/groupBy — there
// is no separate counter table, and nothing here ever mutates Lead, Deal,
// or Activity. All queries are scoped to the authenticated user's own
// campaigns (Business -> Lead -> Campaign -> User, or Deal -> Lead ->
// Campaign -> User), the same ownership chain the rest of the codebase
// uses, so cross-user data never leaks into another user's numbers.
//
// backend_tasks.md's own ActivityType enum has no dedicated "qualified"
// event and no explicit definition of "pipeline value" — both are
// documented, deliberate interpretations (see the two comments below),
// chosen as the smallest sensible reading consistent with the existing
// schema, per the task's own instruction for exactly this situation.

const ALL_ACTIVITY_TYPES: ActivityType[] = [
  "LEAD_CREATED",
  "LEAD_ANALYZED",
  "WEBSITE_GENERATED",
  "DEMO_PUBLISHED",
  "PITCH_GENERATED",
  "WHATSAPP_OPENED",
  "PITCHED",
  "REPLIED",
  "INTERESTED",
  "MEETING",
  "WON",
  "LOST",
];

/**
 * One groupBy query for every Activity-derived count this endpoint needs,
 * instead of one `count()` per metric (section 10: "prefer
 * aggregation/groupBy... avoid loading the full dataset into memory").
 * Missing types (no Activity of that type yet for this user) are filled in
 * as 0 rather than left absent, so callers never need an `?? 0` at every
 * use site.
 */
async function countActivitiesByType(db: PrismaClient, userId: string): Promise<Record<ActivityType, number>> {
  const rows = await db.activity.groupBy({
    by: ["type"],
    where: { lead: { campaign: { userId } } },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(ALL_ACTIVITY_TYPES.map((type) => [type, 0])) as Record<ActivityType, number>;
  for (const row of rows) {
    counts[row.type] = row._count._all;
  }
  return counts;
}

export type AnalyticsFunnel = {
  // CampaignExecution.businessesFound: raw discovery count, before any
  // business ever becomes a Lead row.
  found: number;
  // Every Lead row already passed campaign filtering during ingestion
  // (lib/campaigns/campaign-filters.ts runs before ingestBusinessAsLead
  // ever creates one) — there is no separate "QUALIFIED" LeadStatus or
  // Activity type, so a Lead's mere existence *is* qualification.
  qualified: number;
  analyzed: number;
  demo: number;
  // The explicit operator-confirmed PITCHED event (Phase 7 section 12) —
  // deliberately not the same as the top-level `pitches` metric below,
  // which counts pitch *generation*, not confirmed sends.
  pitched: number;
  replied: number;
  interested: number;
  won: number;
};

export type AnalyticsBreakdown = {
  byCampaign: Array<{ campaignId: string; campaignName: string; leadCount: number }>;
  byRecommendedService: Array<{ recommendedService: string; leadCount: number }>;
  byCategory: Array<{ category: string; businessCount: number }>;
};

export type AnalyticsSummary = {
  totalBusinesses: number;
  qualifiedLeads: number;
  demosGenerated: number;
  // Pitch *generations* (Activity PITCH_GENERATED) — every call to POST
  // /api/leads/:id/pitch that succeeds, including re-generations for the
  // same lead. See `funnel.pitched` for the distinct, smaller "operator
  // confirmed send" count.
  pitches: number;
  replies: number;
  interested: number;
  won: number;
  // sum(Deal.value) WHERE status IN (OPEN, NEGOTIATING): documented as the
  // smallest sensible interpretation of "pipeline" consistent with the
  // schema (backend_tasks.md does not define this term) — WON is excluded
  // because it represents already-closed/converted revenue, not open
  // pipeline, and LOST is excluded because it is dead, non-recoverable
  // value. DealStatus.OPEN is included for schema completeness even though
  // no current code path creates a Deal in that state (lib/leads/lifecycle
  // .ts only creates one starting at NEGOTIATING) — a future direct Deal
  // creation path would land there and should still count as pipeline.
  pipelineValue: number;
  funnel: AnalyticsFunnel;
  breakdown: AnalyticsBreakdown;
};

/**
 * Builds the full analytics summary for one user. Every query below is
 * scoped to that user at the database level (never fetched broadly and
 * filtered in application code) — see the ownership-chain comment at the
 * top of this file.
 */
export async function getAnalyticsForUser(db: PrismaClient, userId: string): Promise<AnalyticsSummary> {
  const [activityCounts, totalBusinesses, qualifiedLeads, pipelineValueAgg, foundAgg, campaignBreakdown, serviceBreakdown, categoryBreakdown, campaigns] = await Promise.all([
    countActivitiesByType(db, userId),
    db.business.count({ where: { leads: { some: { campaign: { userId } } } } }),
    db.lead.count({ where: { campaign: { userId } } }),
    db.deal.aggregate({
      where: { status: { in: ["OPEN", "NEGOTIATING"] }, lead: { campaign: { userId } } },
      _sum: { value: true },
    }),
    db.campaignExecution.aggregate({
      where: { campaign: { userId } },
      _sum: { businessesFound: true },
    }),
    db.lead.groupBy({ by: ["campaignId"], where: { campaign: { userId } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["recommendedService"], where: { campaign: { userId }, recommendedService: { not: null } }, _count: { _all: true } }),
    db.business.groupBy({ by: ["category"], where: { leads: { some: { campaign: { userId } } } }, _count: { _all: true } }),
    db.campaign.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));

  return {
    totalBusinesses,
    qualifiedLeads,
    demosGenerated: activityCounts.WEBSITE_GENERATED,
    pitches: activityCounts.PITCH_GENERATED,
    replies: activityCounts.REPLIED,
    interested: activityCounts.INTERESTED,
    won: activityCounts.WON,
    pipelineValue: pipelineValueAgg._sum.value ?? 0,
    funnel: {
      found: foundAgg._sum.businessesFound ?? 0,
      qualified: qualifiedLeads,
      analyzed: activityCounts.LEAD_ANALYZED,
      demo: activityCounts.WEBSITE_GENERATED,
      pitched: activityCounts.PITCHED,
      replied: activityCounts.REPLIED,
      interested: activityCounts.INTERESTED,
      won: activityCounts.WON,
    },
    breakdown: {
      byCampaign: campaignBreakdown.map((row) => ({
        campaignId: row.campaignId,
        campaignName: campaignNameById.get(row.campaignId) ?? row.campaignId,
        leadCount: row._count._all,
      })),
      byRecommendedService: serviceBreakdown
        .filter((row) => row.recommendedService !== null)
        .map((row) => ({ recommendedService: row.recommendedService as string, leadCount: row._count._all })),
      byCategory: categoryBreakdown.map((row) => ({ category: row.category, businessCount: row._count._all })),
    },
  };
}
