import type { ActivityType, DealStatus, LeadStatus, Lead, Prisma, PrismaClient } from "@pitchmyweb/db";
import { recordActivity } from "../activities/activity.service";
import { InvalidLeadTransitionError, NotFoundError } from "../errors";

// backend_tasks.md section 8: NEW -> ANALYZED -> SITE_READY -> PITCHED ->
// REPLIED -> INTERESTED -> NEGOTIATING -> WON, with LOST reachable from any
// active (non-terminal) stage. WON and LOST are both treated as terminal —
// nothing transitions out of either. This mirrors the doc's own reject
// examples ("WON -> NEW reject"): by the same reasoning, a closed-won deal
// does not revert to LOST, and a closed-lost lead cannot be reopened here.
export const LEAD_LIFECYCLE_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["ANALYZED", "LOST"],
  ANALYZED: ["SITE_READY", "LOST"],
  SITE_READY: ["PITCHED", "LOST"],
  PITCHED: ["REPLIED", "LOST"],
  REPLIED: ["INTERESTED", "LOST"],
  INTERESTED: ["NEGOTIATING", "LOST"],
  NEGOTIATING: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

/**
 * Maps each *target* status to the Activity it records, regardless of
 * which status it was reached from (every path into LOST is the same
 * "lost" event). `NEW` has no entry — creation is recorded once as
 * LEAD_CREATED by the lead domain service, not by a transition.
 *
 * Two entries are documented assumptions because backend_tasks.md's
 * ActivityType enum has no dedicated event for them:
 *  - SITE_READY  -> WEBSITE_GENERATED: the closest documented event; a
 *    lead becomes SITE_READY precisely when its website is generated.
 *  - NEGOTIATING -> MEETING: the closest documented event; this product's
 *    negotiation stage is modeled as following an operator meeting/call.
 */
export const ACTIVITY_FOR_LEAD_STATUS: Partial<Record<LeadStatus, ActivityType>> = {
  ANALYZED: "LEAD_ANALYZED",
  SITE_READY: "WEBSITE_GENERATED",
  PITCHED: "PITCHED",
  REPLIED: "REPLIED",
  INTERESTED: "INTERESTED",
  NEGOTIATING: "MEETING",
  WON: "WON",
  LOST: "LOST",
};

export function isLeadTransitionAllowed(current: LeadStatus, next: LeadStatus): boolean {
  return LEAD_LIFECYCLE_TRANSITIONS[current].includes(next);
}

// Phase 8 section 2/3: Deal represents commercial/pipeline state, derived
// from — never a replacement for — Lead lifecycle. Lead.status is the only
// authority for *whether* a transition is allowed (checked above, entirely
// unaffected by anything below); this mapping only decides what a Deal
// row's own status mirror should read once a transition the lifecycle
// graph already approved has been applied. DealStatus.OPEN is deliberately
// never set here — a lead only becomes commercially relevant once it
// reaches NEGOTIATING, so a Deal row is created for the first time already
// at NEGOTIATING, not at some earlier OPEN placeholder stage.
const DEAL_STATUS_FOR_LEAD_STATUS: Partial<Record<LeadStatus, DealStatus>> = {
  NEGOTIATING: "NEGOTIATING",
  WON: "WON",
};

/**
 * Creates or updates the Deal row that mirrors this lead's commercial
 * state, as a side effect of an already-validated, already-applied
 * transition (section 2: "do not directly mutate Lead.status from
 * analytics/CRM code" — the inverse holds too: Deal sync never influences
 * whether a Lead transition is allowed, it only reacts after the fact).
 *
 * - NEGOTIATING (first time): creates a Deal, seeded with the lead's own
 *   already-persisted estimatedDealMax (falling back to estimatedDealMin,
 *   then 0) as a starting value — never invented, always sourced from data
 *   the lead already has on file (Phase 5's AI analysis).
 * - NEGOTIATING again / WON: updates only `status`, leaving `value`
 *   untouched — so a deal's value is never silently reset back to the
 *   original estimate after this point.
 * - LOST: updates an *existing* Deal's status to LOST, if one exists. A
 *   lead lost before ever reaching NEGOTIATING never had a deal to lose,
 *   so this deliberately does not create one — `updateMany` is a no-op
 *   when no row matches, not an error.
 */
async function syncDealForTransition(tx: Prisma.TransactionClient, lead: Lead, nextStatus: LeadStatus): Promise<void> {
  const dealStatus = DEAL_STATUS_FOR_LEAD_STATUS[nextStatus];
  if (dealStatus) {
    const value = lead.estimatedDealMax ?? lead.estimatedDealMin ?? 0;
    await tx.deal.upsert({
      where: { leadId: lead.id },
      create: { leadId: lead.id, value, status: dealStatus },
      update: { status: dealStatus },
    });
    return;
  }

  if (nextStatus === "LOST") {
    await tx.deal.updateMany({ where: { leadId: lead.id }, data: { status: "LOST" } });
  }
}

export type TransitionLeadStatusInput = {
  leadId: string;
  nextStatus: LeadStatus;
  metadata?: Record<string, unknown>;
  // Phase 4 code-review finding #10: this domain service otherwise has no
  // awareness at all of who is allowed to transition a given lead — the
  // only thing preventing a cross-user transition is that the one current
  // caller (PATCH /api/leads/:id) happens to check ownership itself before
  // calling this. That makes ownership enforcement entirely a matter of
  // caller discipline rather than something this function guarantees.
  // `expectedOwnerUserId` is an optional defense-in-depth check: when
  // provided, the transition is rejected (same NotFoundError a missing
  // lead would produce — no existence leakage) unless the lead's campaign
  // belongs to that user. It is optional and additive specifically so
  // existing callers that operate outside a per-request user context (e.g.
  // applyLeadAnalysis, part of the internal analysis pipeline) are
  // unaffected — no existing call site's behavior changes.
  expectedOwnerUserId?: string;
};

/**
 * Transaction-scoped core of the transition: validates, updates, records
 * the Activity. Exported separately so other domain services (e.g. lead
 * analysis, which already has its own open transaction) can compose a
 * validated transition into a larger atomic operation instead of nesting
 * `$transaction` calls, which Prisma's transaction client does not support.
 */
export async function transitionLeadStatusInTx(tx: Prisma.TransactionClient, input: TransitionLeadStatusInput): Promise<Lead> {
  const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) {
    throw new NotFoundError("Lead", input.leadId);
  }

  if (input.expectedOwnerUserId) {
    const campaign = await tx.campaign.findUnique({ where: { id: lead.campaignId }, select: { userId: true } });
    if (!campaign || campaign.userId !== input.expectedOwnerUserId) {
      throw new NotFoundError("Lead", input.leadId);
    }
  }

  if (!isLeadTransitionAllowed(lead.status, input.nextStatus)) {
    throw new InvalidLeadTransitionError(lead.status, input.nextStatus);
  }

  const updated = await tx.lead.update({
    where: { id: lead.id },
    data: { status: input.nextStatus },
  });

  const activityType = ACTIVITY_FOR_LEAD_STATUS[input.nextStatus];
  if (activityType) {
    await recordActivity(tx, { leadId: lead.id, type: activityType, metadata: input.metadata });
  }

  await syncDealForTransition(tx, updated, input.nextStatus);

  return updated;
}

/**
 * Validates and applies a lead lifecycle transition, recording the
 * corresponding Activity in the same transaction (section 8/38). Rejects
 * illegal transitions without mutating the lead or creating an Activity.
 *
 * Takes a top-level PrismaClient (not a transaction client) because it
 * opens its own transaction. Use `transitionLeadStatusInTx` instead when
 * composing this into a caller-owned transaction.
 */
export async function transitionLeadStatus(db: PrismaClient, input: TransitionLeadStatusInput): Promise<Lead> {
  return db.$transaction((tx) => transitionLeadStatusInTx(tx, input));
}
