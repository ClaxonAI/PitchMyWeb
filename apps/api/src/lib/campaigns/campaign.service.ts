import type { Campaign, CampaignStatus, PrismaClient } from "@pitchmyweb/db";
import { ConflictError, InvalidCampaignTransitionError, NotFoundError } from "../errors";
import { leadLimitForTarget, type CampaignCreateInput, type CampaignListQuery, type CampaignUpdateInput } from "../validation/campaign";

// Campaign domain service (backend_tasks.md section 5.2/23). Prepares the
// operations POST/PATCH /api/campaigns and POST /api/campaigns/:id/run
// will call in a later phase; does not implement routes or the actual
// provider-triggered discovery orchestration (run.service.ts owns that).

/**
 * Campaign status graph. The doc names the six status values without
 * specifying the exact transition graph, so this is the smallest
 * reasonable state machine: linear execution states, both COMPLETED and
 * FAILED treated as terminal (no documented retry/resume flow to build
 * against), READY can return to DRAFT for further edits before running.
 */
export const CAMPAIGN_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["READY"],
  READY: ["DRAFT", "RUNNING"],
  RUNNING: ["PROCESSING", "FAILED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

export function isCampaignTransitionAllowed(current: CampaignStatus, next: CampaignStatus): boolean {
  return CAMPAIGN_STATUS_TRANSITIONS[current].includes(next);
}

// Derived (not hand-duplicated) from CAMPAIGN_STATUS_TRANSITIONS: every
// status that is legally allowed to move to RUNNING. Used as the WHERE
// clause for the atomic conditional update in prepareCampaignRun below.
const CAMPAIGN_STATUS_TRANSITIONS_INTO_RUNNING: CampaignStatus[] = (Object.keys(CAMPAIGN_STATUS_TRANSITIONS) as CampaignStatus[]).filter(
  (status) => CAMPAIGN_STATUS_TRANSITIONS[status].includes("RUNNING"),
);

// Fields are only safe to edit while the campaign has not started
// executing (section 23: "prevent invalid changes while campaign is
// running").
const EDITABLE_STATUSES: CampaignStatus[] = ["DRAFT", "READY"];

// Exported (Phase 4): the API-layer run service (lib/campaigns/run.service.ts)
// reuses this exact ownership check instead of re-querying/re-implementing
// it, keeping the "same 404 for missing vs. not-yours" rule defined once.
export async function loadOwnedCampaign(db: PrismaClient, campaignId: string, userId: string): Promise<Campaign> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  // Same 404 for "missing" and "belongs to someone else" — no data leakage
  // about another user's campaigns (section 45: "403 or 404, no data
  // leakage"; 404 chosen here to avoid confirming existence at all).
  if (!campaign || campaign.userId !== userId) {
    throw new NotFoundError("Campaign", campaignId);
  }
  return campaign;
}

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// GET /api/campaigns (future route, section 7). Scoped to the authenticated
// user at the query level (not filtered in application code) so another
// user's campaigns are never even fetched.
export async function listCampaignsForUser(db: PrismaClient, userId: string, query: CampaignListQuery): Promise<PaginatedResult<Campaign>> {
  const where = { userId, ...(query.status ? { status: query.status } : {}) };

  const [items, total] = await Promise.all([
    db.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.campaign.count({ where }),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function createCampaign(db: PrismaClient, userId: string, rawInput: CampaignCreateInput): Promise<Campaign> {
  const input = {
    ...rawInput,
    market: rawInput.market ?? "india",
    selectionMode: rawInput.selectionMode ?? "MANUAL",
    targetCount: rawInput.targetCount ?? 20,
    deliveryMode: rawInput.deliveryMode ?? "AUTO",
  } as const;
  return db.campaign.create({
    data: {
      userId,
      name: input.name,
      market: input.market,
      location: input.location,
      radius: input.radius,
      category: input.category,
      minRating: input.minRating,
      minReviews: input.minReviews,
      websiteRequirement: input.websiteRequirement,
      leadLimit: input.leadLimit ?? leadLimitForTarget(input.targetCount),
      selectionMode: input.selectionMode,
      targetCount: input.targetCount,
      deliveryMode: input.deliveryMode,
      messageTemplate: input.messageTemplate,
      status: "DRAFT",
    },
  });
}

export async function updateCampaign(db: PrismaClient, userId: string, campaignId: string, input: CampaignUpdateInput): Promise<Campaign> {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);

  if (!EDITABLE_STATUSES.includes(campaign.status)) {
    throw new ConflictError(`Campaign cannot be edited while status is ${campaign.status}`);
  }

  // `status` is deliberately never forwarded to Prisma here even though
  // CampaignUpdateInput allows it (Zod restricts it to the literal "READY").
  // The only sanctioned path from a client-supplied status to a real status
  // change is markCampaignReady() below, which re-validates the transition
  // through CAMPAIGN_STATUS_TRANSITIONS — this function stays a pure field
  // update so it can never become a second, unvalidated way to change
  // status (Rule 7).
  const { status: _status, ...fields } = input;

  // Editing "how many leads" has to move the discovery cap with it. Without
  // this, a campaign created for 20 and edited down to 5 still scrapes 20:
  // leadLimit was derived from targetCount once, at creation, and nothing
  // re-derived it. An explicit leadLimit in the same request still wins.
  const data = fields.targetCount != null && fields.leadLimit == null ? { ...fields, leadLimit: leadLimitForTarget(fields.targetCount) } : fields;

  return db.campaign.update({ where: { id: campaign.id }, data });
}

export async function markCampaignReady(db: PrismaClient, userId: string, campaignId: string): Promise<Campaign> {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  if (!isCampaignTransitionAllowed(campaign.status, "READY")) {
    throw new InvalidCampaignTransitionError(campaign.status, "READY");
  }
  return db.campaign.update({ where: { id: campaign.id }, data: { status: "READY" } });
}

/**
 * Validates the campaign can start and transitions it to RUNNING. This is
 * *preparation* for execution only — it does not call the lead provider or
 * perform the long-running discovery workflow itself (run.service.ts owns
 * that orchestration).
 *
 * Phase 4 fix: the original implementation checked `isCampaignTransitionAllowed`
 * and then issued a plain `update`, which is a check-then-act race — two
 * concurrent requests can both pass the check before either commits, and
 * both would then "win" the plain update. Section 8's explicit requirement
 * ("prevent two concurrent requests from starting the same campaign
 * simultaneously," "do not use an in-memory boolean/lock," "use database
 * transactions and unique constraints") means the check has to happen
 * atomically in the database, not in application code. `updateMany` with
 * the allowed-source-statuses in the WHERE clause does that: Postgres
 * serializes concurrent UPDATEs to the same row, so only the first request
 * to actually reach the database can match the WHERE clause and flip the
 * status — a second concurrent request's WHERE no longer matches once the
 * first commits, so its `updateMany` matches 0 rows and this throws
 * InvalidCampaignTransitionError (409) instead of silently double-running.
 */
export async function prepareCampaignRun(db: PrismaClient, userId: string, campaignId: string): Promise<Campaign> {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  if (!isCampaignTransitionAllowed(campaign.status, "RUNNING")) {
    throw new InvalidCampaignTransitionError(campaign.status, "RUNNING");
  }

  const allowedSourceStatuses = CAMPAIGN_STATUS_TRANSITIONS_INTO_RUNNING;
  const { count } = await db.campaign.updateMany({
    where: { id: campaign.id, status: { in: allowedSourceStatuses } },
    data: { status: "RUNNING" },
  });

  if (count === 0) {
    // Lost the race: re-read the now-current status for an accurate error.
    const current = await db.campaign.findUnique({ where: { id: campaign.id } });
    throw new InvalidCampaignTransitionError(current?.status ?? campaign.status, "RUNNING");
  }

  return { ...campaign, status: "RUNNING" };
}

export function getCampaignById(db: PrismaClient, userId: string, campaignId: string) {
  return loadOwnedCampaign(db, campaignId, userId);
}
