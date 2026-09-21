import type { Business, Campaign, Lead, LeadPipeline, PrismaClient } from "@pitchmyweb/db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { normalizePhoneForWhatsApp } from "../leads/whatsapp.service";
import { emitEvent } from "../observability/events";
import { startPipelines, type PipelineDeps } from "../pipeline/pipeline.service";
import { calculateOpportunityScore } from "../scoring/scoring";
import { loadOwnedCampaign } from "./campaign.service";

// Choosing which discovered leads get a site, a video and a pitch.
//
//   Manual: the user ticks leads in the dashboard (selectLeads).
//   Auto:   when discovery completes, the top N by score are chosen
//           (autoSelectTopLeads), N = campaign.targetCount.
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

/** Best first: score, then rating, then review count, then id (stable). */
export function compareLeadRows(a: CampaignLeadRow, b: CampaignLeadRow): number {
  return (
    b.score - a.score ||
    (b.business.rating ?? 0) - (a.business.rating ?? 0) ||
    (b.business.reviewCount ?? 0) - (a.business.reviewCount ?? 0) ||
    a.id.localeCompare(b.id)
  );
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
    const hasValidPhone = normalizePhoneForWhatsApp(lead.business.phone) !== null;
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

export type CampaignLeadsQuery = { sort?: "score" | "recent"; search?: string };

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
  rows = query.sort === "recent" ? rows.reverse() : rows.sort(compareLeadRows);

  return { items: rows, total: rows.length, selectedCount, targetCount: campaign.targetCount };
}

function remainingSlots(campaign: Campaign, alreadySelected: number): number {
  return Math.max(0, campaign.targetCount - alreadySelected);
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

  const started = await startPipelines(db, { campaignId: campaign.id, leadIds: unique }, deps);
  emitEvent("selection.completed", { campaignId: campaign.id, mode: "manual", selected: started.length });
  return { started };
}

/**
 * Picks the best remaining eligible leads up to targetCount and starts their
 * pipelines. System-initiated (discovery completion) or user-initiated
 * (the "auto-select" button).
 */
export async function autoSelectTopLeads(db: PrismaClient, campaignId: string, deps?: PipelineDeps): Promise<{ started: LeadPipeline[] }> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError("Campaign", campaignId);

  const rows = (await loadCampaignLeadRows(db, campaign.id)).sort(compareLeadRows);
  const selectedCount = rows.filter((row) => row.pipeline).length;
  const picks = rows.filter((row) => row.selectable).slice(0, remainingSlots(campaign, selectedCount));

  const started = await startPipelines(db, { campaignId: campaign.id, leadIds: picks.map((row) => row.id) }, deps);
  emitEvent("selection.completed", { campaignId: campaign.id, mode: "auto", selected: started.length, eligible: rows.filter((r) => r.selectable).length });
  return { started };
}

export async function autoSelectForUser(db: PrismaClient, userId: string, campaignId: string, deps?: PipelineDeps) {
  const campaign = await loadOwnedCampaign(db, campaignId, userId);
  if (!["PROCESSING", "COMPLETED"].includes(campaign.status)) {
    throw new ConflictError("Leads can be selected once discovery has started returning results");
  }
  return autoSelectTopLeads(db, campaign.id, deps);
}

/**
 * Hook run when a discovery run completes. Never throws: a selection problem
 * must not turn a successful discovery into a failed webhook delivery.
 */
export async function onDiscoveryCompleted(db: PrismaClient, campaignId: string, deps?: PipelineDeps): Promise<void> {
  try {
    const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { selectionMode: true } });
    if (campaign?.selectionMode !== "AUTO") return;
    await autoSelectTopLeads(db, campaignId, deps);
  } catch (error) {
    console.error(`Auto-selection failed for campaign ${campaignId}:`, error);
    emitEvent("selection.failed", { campaignId, mode: "auto" }, { level: "error", alert: true });
  }
}
