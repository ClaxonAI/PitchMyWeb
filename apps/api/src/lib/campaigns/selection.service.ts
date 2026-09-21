import type { Business, Campaign, Lead, LeadPipeline, PrismaClient } from "@pitchmyweb/db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { isPitchableBusiness } from "../leads/phone";
import { emitEvent } from "../observability/events";
import { startPipelines, type PipelineDeps } from "../pipeline/pipeline.service";
import { calculateOpportunityScore } from "../scoring/scoring";
import { releasePitchCredits, reservePitchCredits } from "../checkout/wallet.service";
import { loadOwnedCampaign } from "./campaign.service";

// Choosing which discovered leads get a site, a video and a pitch.
//
//   Manual: the user ticks leads in the dashboard (selectLeads).
//   Auto:   when discovery completes, every eligible lead is chosen, in the
//           order discovery found them (autoSelectLeads).
//
// There is deliberately no ranking here. Discovery now stops once it has
// found targetCount leads the user can actually be given, so by the time
// selection runs there is nothing to rank: the eligible set is the set that
// was asked for. Scoring a fixed list and then taking all of it only
// created the impression that a choice was being made.
//
// Both paths end in startPipelines(). A campaign never pitches more than
// targetCount leads in total, and only leads WhatsApp can reach qualify.

/** Hard cap on how many leads a campaign dashboard loads at once. */
export const MAX_CAMPAIGN_LEADS = 500;

const SELECTABLE_LEAD_STATUSES = ["NEW", "ANALYZED"] as const;

export type CampaignLeadRow = {
  id: string;
  status: Lead["status"];
  score: number;
  scoreIsEstimated: boolean;
  summary: string | null;
  services: string[];
  createdAt: Date;
  business: Pick<Business, "id" | "name" | "category" | "city" | "address" | "phone" | "website" | "websiteVerificationStatus" | "rating" | "reviewCount">;
  hasValidPhone: boolean;
  pitch: string | null;
  pipeline: (Pick<LeadPipeline, "id" | "stage" | "failureReason"> & { videoReady: boolean }) | null;
  selectable: boolean;
  /**
   * Why this lead is not selectable, for the dashboard to show instead of
   * leaving the row blank. A lead with no WhatsApp-reachable phone can never
   * be pitched, and before this it simply sat in the table with an empty
   * pipeline column — the single most confusing thing about a run where
   * discovery found businesses but auto-selection picked almost none.
   */
  blockedReason: "no_phone" | "already_selected" | "not_pitchable_status" | null;
};

function blockedReasonFor(row: { pipeline: unknown; hasValidPhone: boolean; status: Lead["status"] }): CampaignLeadRow["blockedReason"] {
  if (row.pipeline) return "already_selected";
  if (!row.hasValidPhone) return "no_phone";
  if (!(SELECTABLE_LEAD_STATUSES as readonly string[]).includes(row.status)) return "not_pitchable_status";
  return null;
}

function effectiveScore(lead: Lead & { business: Business }): { score: number; estimated: boolean } {
  if (typeof lead.score === "number") return { score: lead.score, estimated: false };
  const { total } = calculateOpportunityScore({
    rating: lead.business.rating,
    reviewCount: lead.business.reviewCount,
    website: lead.business.website,
    instagram: lead.business.instagram,
    facebook: lead.business.facebook,
    phone: lead.business.phone,
    email: lead.business.email,
    address: lead.business.address,
    city: lead.business.city,
    latitude: lead.business.latitude,
    longitude: lead.business.longitude,
  });
  return { score: total, estimated: true };
}

async function loadCampaignLeadRows(db: PrismaClient, campaignId: string): Promise<CampaignLeadRow[]> {
  const leads = await db.lead.findMany({
    where: { campaignId },
    include: {
      business: true,
      pitches: { where: { status: "GENERATED" }, orderBy: { createdAt: "desc" }, take: 1 },
      pipelines: { where: { campaignId }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_CAMPAIGN_LEADS,
  });

  const recordingIds = leads.flatMap((lead) => (lead.pipelines[0]?.recordingId ? [lead.pipelines[0].recordingId] : []));
  const readyRecordings = recordingIds.length
    ? await db.demoRecording.findMany({ where: { id: { in: recordingIds }, status: "READY", storageKey: { not: null } }, select: { id: true } })
    : [];
  const readyIds = new Set(readyRecordings.map((recording) => recording.id));

  return leads.map((lead) => {
    const { score, estimated } = effectiveScore(lead);
    const pipeline = lead.pipelines[0] ?? null;
    const hasValidPhone = isPitchableBusiness(lead.business);
    return {
      id: lead.id,
      status: lead.status,
      score,
      scoreIsEstimated: estimated,
      summary: lead.summary,
      services: lead.services,
      createdAt: lead.createdAt,
      business: {
        id: lead.business.id,
        name: lead.business.name,
        category: lead.business.category,
        city: lead.business.city,
        address: lead.business.address,
        phone: lead.business.phone,
        website: lead.business.website,
        websiteVerificationStatus: lead.business.websiteVerificationStatus,
        rating: lead.business.rating,
        reviewCount: lead.business.reviewCount,
      },
      hasValidPhone,
      pitch: lead.pitches[0]?.content ?? null,
      pipeline: pipeline ? { id: pipeline.id, stage: pipeline.stage, failureReason: pipeline.failureReason, videoReady: pipeline.recordingId ? readyIds.has(pipeline.recordingId) : false } : null,
      selectable: !pipeline && hasValidPhone && (SELECTABLE_LEAD_STATUSES as readonly string[]).includes(lead.status),
      blockedReason: blockedReasonFor({ pipeline, hasValidPhone, status: lead.status }),
    };
  });
}

export type CampaignLeadsQuery = { sort?: "found" | "recent" | "score"; search?: string };

export async function listCampaignLeads(
  db: PrismaClient,
  userId: string,
  campaignId: string,
  query: CampaignLeadsQuery = {},
): Promise<{ items: CampaignLeadRow[]; total: number; selectedCount: number; targetCount: number }> {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  let rows = await loadCampaignLeadRows(db, campaign.id);
  const selectedCount = rows.filter((row) => row.pipeline).length;

  const search = query.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter((row) => `${row.business.name} ${row.business.city ?? ""} ${row.business.address ?? ""}`.toLowerCase().includes(search));
  }
  // Discovery order by default (loadCampaignLeadRows orders by createdAt);
  // "recent" reverses it. Ranking by score is gone — selection no longer
  // uses it, so offering it here would suggest the order changes which
  // leads get pitched, which it does not.
  if (query.sort === "recent") rows = rows.reverse();

  return { items: rows, total: rows.length, selectedCount, targetCount: campaign.targetCount };
}

function remainingSlots(campaign: Campaign, alreadySelected: number): number {
  return Math.max(0, campaign.targetCount - alreadySelected);
}

/**
 * The atomic reservation at the heart of "never send more pitches than were
 * paid for": reserves `requestedCount` credits, attempts to claim up to
 * that many of `candidateLeadIds` as new LeadPipeline rows, and releases
 * whatever of the reservation wasn't actually spent — both because fewer
 * eligible candidates existed than requested (rule 7: "20 credits, request
 * 15, only 11 eligible -> reserve only 11") and because a concurrent
 * request can win a lead this one also wanted (LeadPipeline's
 * @@unique([campaignId, leadId]) plus skipDuplicates decides that race, not
 * this function — see startPipelines's own comment on why it re-queries by
 * batchId rather than trusting the requested list).
 *
 * Two transactions, not one spanning the whole call: the reserve+batch-
 * create commits first, then startPipelines runs (which makes real network
 * calls — website publish, recording request — that must never happen
 * inside a DB transaction holding a row lock), then a final small
 * transaction records the true count and releases any shortfall. A crash in
 * the gap between the first and last leaves a PitchBatch reserved with
 * nothing to show for it yet; pipeline-maintenance.job.ts's stale-pipeline
 * reconciliation (Phase 6) is the safety net for that, not this function.
 */
async function reservePitchBatch(
  db: PrismaClient,
  input: { campaignId: string; userId: string; requestedCount: number; candidateLeadIds: readonly string[]; mode: "MANUAL" | "AUTO" },
  deps?: PipelineDeps,
): Promise<{ started: LeadPipeline[] }> {
  if (input.requestedCount <= 0) return { started: [] };

  const batch = await db.$transaction(async (tx) => {
    const created = await tx.pitchBatch.create({
      data: { campaignId: input.campaignId, userId: input.userId, requestedCount: input.requestedCount, reservedCount: 0, mode: input.mode },
    });
    try {
      await reservePitchCredits(tx, input.userId, input.requestedCount, `reserve:${created.id}`);
    } catch (error) {
      // Nothing else has committed for this batch yet — remove the empty
      // shell rather than leaving a PROCESSING row with 0 reservedCount
      // (and 0 credits ever reserved against it) sitting around forever.
      await tx.pitchBatch.delete({ where: { id: created.id } });
      throw error;
    }
    return created;
  });

  const candidates = input.candidateLeadIds.slice(0, input.requestedCount);
  const started = await startPipelines(db, { campaignId: input.campaignId, leadIds: candidates, batchId: batch.id }, deps);
  const actualCount = started.length;
  const shortfall = input.requestedCount - actualCount;

  await db.$transaction(async (tx) => {
    if (shortfall > 0) await releasePitchCredits(tx, input.userId, shortfall, `release:${batch.id}`);
    await tx.pitchBatch.update({
      where: { id: batch.id },
      data: { reservedCount: actualCount, ...(actualCount === 0 ? { status: "COMPLETED", completedAt: new Date() } : {}) },
    });
  });

  return { started };
}

/** Manual selection from the dashboard. */
export async function selectLeads(
  db: PrismaClient,
  userId: string,
  campaignId: string,
  leadIds: readonly string[],
  deps?: PipelineDeps,
): Promise<{ started: LeadPipeline[] }> {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  if (!["PROCESSING", "COMPLETED"].includes(campaign.status)) {
    throw new ConflictError("Leads can be selected once discovery has started returning results");
  }

  const unique = [...new Set(leadIds)];
  const rows = await loadCampaignLeadRows(db, campaign.id);
  const byId = new Map(rows.map((row) => [row.id, row]));

  const unknown = unique.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new NotFoundError("Lead", unknown[0]!);

  const notSelectable = unique.map((id) => byId.get(id)!).filter((row) => !row.selectable);
  if (notSelectable.length > 0) {
    const first = notSelectable[0]!;
    const why = first.pipeline ? "is already selected" : !first.hasValidPhone ? "has no WhatsApp-reachable phone number" : `is ${first.status}`;
    throw new ValidationError(`${first.business.name} ${why}`);
  }

  const selectedCount = rows.filter((row) => row.pipeline).length;
  const slots = remainingSlots(campaign, selectedCount);
  if (unique.length > slots) {
    throw new ValidationError(`This campaign can pitch ${campaign.targetCount} leads; ${slots} slot(s) left`);
  }

  // requestedCount === unique.length: every id here was already validated
  // selectable above, so there is nothing left to "pick" — the candidate
  // list *is* the request. InsufficientPitchCreditsError from here (wallet
  // balance below unique.length) propagates as-is to the route.
  const result = await reservePitchBatch(db, { campaignId: campaign.id, userId, requestedCount: unique.length, candidateLeadIds: unique, mode: "MANUAL" }, deps);
  emitEvent("selection.completed", { campaignId: campaign.id, mode: "manual", selected: result.started.length });
  return result;
}

/**
 * Starts pipelines for up to `options.count` remaining eligible leads (or
 * every remaining slot, when omitted — the system-triggered
 * onDiscoveryCompleted path), in the order discovery found them.
 * System-initiated (discovery completion) or user-initiated (the
 * "auto-select" button, or the "how many do you want to pitch?" flow).
 */
export async function autoSelectLeads(db: PrismaClient, campaignId: string, options: { count?: number } = {}, deps?: PipelineDeps): Promise<{ started: LeadPipeline[] }> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError("Campaign", campaignId);

  // loadCampaignLeadRows already orders by createdAt, which is discovery
  // order — the order the user saw the leads arrive in.
  const rows = await loadCampaignLeadRows(db, campaign.id);
  const selectedCount = rows.filter((row) => row.pipeline).length;
  const slots = remainingSlots(campaign, selectedCount);
  const requestedCount = Math.min(options.count ?? slots, slots);
  const eligible = rows.filter((row) => row.selectable);
  const candidateLeadIds = eligible.slice(0, requestedCount).map((row) => row.id);

  const result = await reservePitchBatch(db, { campaignId: campaign.id, userId: campaign.userId, requestedCount, candidateLeadIds, mode: "AUTO" }, deps);
  emitEvent("selection.completed", { campaignId: campaign.id, mode: "auto", selected: result.started.length, eligible: eligible.length });
  return result;
}

export async function autoSelectForUser(db: PrismaClient, userId: string, campaignId: string, options?: { count?: number }, deps?: PipelineDeps) {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  if (!["PROCESSING", "COMPLETED"].includes(campaign.status)) {
    throw new ConflictError("Leads can be selected once discovery has started returning results");
  }
  return autoSelectLeads(db, campaign.id, options, deps);
}

/**
 * How long a batch may sit mid-reservation before the maintenance job
 * treats it as abandoned. reservePitchBatch commits its reservation, then
 * creates pipelines, then records the true count — a crash between the
 * first and last leaves a PROCESSING batch with reservedCount still 0 and
 * credits reserved against nothing. A legitimate in-flight request takes
 * seconds (bounded-concurrency site publish + recording enqueue), never
 * this long.
 */
export const STALE_BATCH_MS = 10 * 60 * 1000;

/**
 * Releases credits stranded by a crash between reserving them and
 * recording what they were actually spent on. Returns how many batches
 * were recovered. Never throws for one bad batch — a single unrecoverable
 * row must not stop the rest of the sweep.
 */
export async function recoverStaleBatches(db: PrismaClient, now = new Date()): Promise<number> {
  const stale = await db.pitchBatch.findMany({
    where: { status: "PROCESSING", reservedCount: 0, createdAt: { lte: new Date(now.getTime() - STALE_BATCH_MS) } },
    take: 50,
  });

  let recovered = 0;
  for (const batch of stale) {
    try {
      // A pipeline existing at all means startPipelines got far enough to
      // create one, so this batch is the *pipeline* recovery path's problem
      // (abandonStalePipeline), not a stranded reservation.
      const pipelines = await db.leadPipeline.count({ where: { batchId: batch.id } });
      if (pipelines > 0) continue;

      await db.$transaction(async (tx) => {
        const claimed = await tx.pitchBatch.updateMany({
          where: { id: batch.id, status: "PROCESSING", reservedCount: 0 },
          data: { status: "COMPLETED", completedAt: now },
        });
        if (claimed.count !== 1) return;
        await releasePitchCredits(tx, batch.userId, batch.requestedCount, `release-stale:${batch.id}`);
      });
      recovered += 1;
    } catch (error) {
      console.error(`Could not recover stale pitch batch ${batch.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return recovered;
}

/**
 * Hook run when a discovery run completes. Never throws: a selection problem
 * must not turn a successful discovery into a failed webhook delivery. An
 * InsufficientPitchCreditsError here (the campaign's own owner ran out of
 * credits mid-run) is exactly the kind of failure this swallows and logs —
 * the campaign still completed successfully, it just has nothing auto-
 * selected until the user adds credits and selects manually.
 */
export async function onDiscoveryCompleted(db: PrismaClient, campaignId: string, deps?: PipelineDeps): Promise<void> {
  try {
    const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { selectionMode: true } });
    if (campaign?.selectionMode !== "AUTO") return;
    await autoSelectLeads(db, campaignId, {}, deps);
  } catch (error) {
    console.error(`Auto-selection failed for campaign ${campaignId}:`, error);
    emitEvent("selection.failed", { campaignId, mode: "auto" }, { level: "error", alert: true });
  }
}
