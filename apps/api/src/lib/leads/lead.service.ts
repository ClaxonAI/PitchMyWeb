import type { Business, Lead, Pitch, Prisma, PrismaClient, ServiceCode } from "@pitchmyweb/db";
import { normalizeBusinessInput } from "../business/normalize";
import { resolveBusiness } from "../business/dedupe";
import { businessProviderInputSchema, type BusinessProviderInput, type DiscoveryInsights } from "../validation/business";
import { recordActivity } from "../activities/activity.service";
import { NotFoundError, isUniqueConstraintViolation } from "../errors";
import { transitionLeadStatusInTx } from "./lifecycle";
import { calculateOpportunityScore, type OpportunityScore } from "../scoring/scoring";

/** Pitch.promptVersion for messages written by the discovery workflow. */
export const DISCOVERY_PITCH_PROMPT_VERSION = "discovery-v1";
import type { LeadListQuery } from "../validation/lead";
import type { PaginatedResult } from "../campaigns/campaign.service";

// Lead domain service (backend_tasks.md section 7/24/26): loading/creating
// leads through controlled operations, business+campaign association,
// score/recommendation persistence, activity recording. Status changes
// always go through lifecycle.ts — nothing here assigns `status` directly.

export type CreateLeadInput = {
  campaignId: string;
  businessId: string;
};

type CreateLeadResult = { lead: Lead; created: boolean };

// Phase 4 follow-up (V1 campaign execution): the `created` flag lets
// callers distinguish "a new Lead row was actually inserted" from "this
// (campaignId, businessId) pair already had a Lead, found and reused" —
// needed so campaign execution can correctly count leadLimit against
// genuinely new leads rather than re-counting a business the same run
// happens to encounter twice (section 10/12: leadLimit must reflect
// successfully created leads, not raw provider/business counts).
async function createLeadInTx(tx: Prisma.TransactionClient, input: CreateLeadInput): Promise<CreateLeadResult> {
  const existing = await tx.lead.findUnique({
    where: { campaignId_businessId: { campaignId: input.campaignId, businessId: input.businessId } },
  });
  if (existing) return { lead: existing, created: false };

  const lead = await tx.lead.create({ data: { campaignId: input.campaignId, businessId: input.businessId } });
  await recordActivity(tx, { leadId: lead.id, type: "LEAD_CREATED" });
  return { lead, created: true };
}

/**
 * Creates a Lead for a (campaignId, businessId) pair, or returns the
 * existing one if it already exists — enforcing the same uniqueness rule
 * as the database's `@@unique([campaignId, businessId])` constraint
 * (section 7/37: retries must not create duplicate Leads). A short retry
 * recovers from the rare race where two concurrent calls both pass the
 * existence check before either commits; the database constraint is what
 * actually prevents the duplicate row, this is just idempotent recovery
 * around it.
 */
export async function createLead(db: PrismaClient, input: CreateLeadInput): Promise<Lead> {
  try {
    const { lead } = await db.$transaction((tx) => createLeadInTx(tx, input));
    return lead;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const existing = await db.lead.findUnique({
        where: { campaignId_businessId: { campaignId: input.campaignId, businessId: input.businessId } },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export type IngestBusinessAsLeadInput = {
  campaignId: string;
  providerInput: BusinessProviderInput;
};

export type IngestBusinessAsLeadResult = { business: Business; lead: Lead; leadCreated: boolean };

/**
 * Composes the normalize -> deduplicate -> create-lead pipeline
 * (backend_tasks.md section 44, steps 4-6) as a single atomic operation.
 * `leadCreated` is true only when a new Lead row was actually inserted —
 * see createLeadInTx above.
 */
export async function ingestBusinessAsLead(db: PrismaClient, input: IngestBusinessAsLeadInput): Promise<IngestBusinessAsLeadResult> {
  // Rule 5: provider responses are external/untrusted input, same as a
  // frontend request or a worker callback body — they must be validated
  // with Zod before anything downstream trusts their shape. This schema existed
  // (lib/validation/business.ts) but was never actually applied at
  // runtime; a malformed provider record would previously either crash
  // deep inside normalizeBusinessInput with an unrelated TypeError, or in
  // some cases silently pass through with a wrong shape. Calling .parse()
  // here means a malformed business now fails fast with a clear message,
  // and — because every caller of ingestBusinessAsLead (run.service.ts)
  // already isolates per-business failures in a try/catch — it is
  // recorded as a failed business rather than crashing the whole
  // execution (section 6/12).
  const providerInput = businessProviderInputSchema.parse(input.providerInput);
  const normalized = normalizeBusinessInput(providerInput);
  return db.$transaction(async (tx) => {
    const { business } = await resolveBusiness(tx, normalized, {
      source: normalized.source,
      sourceBusinessId: normalized.externalId,
      sourceUrl: null,
      rawData: providerInput,
    });
    const { lead, created } = await createLeadInTx(tx, { campaignId: input.campaignId, businessId: business.id });
    return { business, lead, leadCreated: created };
  });
}

const LEAD_DETAIL_INCLUDE = {
  business: true,
  campaign: true,
  scores: { orderBy: { createdAt: "desc" as const }, take: 1 },
  // Phase 5: backend_tasks.md section 24 explicitly lists "AI analysis" as
  // part of the lead detail payload. Latest attempt only, same pattern as
  // `scores` above — LeadAnalysis is an append-only history table.
  analyses: { orderBy: { createdAt: "desc" as const }, take: 1 },
  activities: { orderBy: { createdAt: "asc" as const } },
  websiteProjects: true,
  pitches: true,
  outreach: true,
  deal: true,
};

export function getLeadById(db: PrismaClient, id: string) {
  return db.lead.findUnique({ where: { id }, include: LEAD_DETAIL_INCLUDE });
}

/**
 * GET /api/leads/:id (section 24/10): loads the full lead detail payload,
 * but only after confirming the lead's campaign belongs to `userId`. Same
 * "404 for missing or not yours" convention as
 * campaign.service.loadOwnedCampaign — a lead's ownership flows through its
 * Campaign, so the check happens here rather than duplicating it at every
 * call site.
 *
 * Phase 4 code-review finding #9: this used to call getLeadById() (the full
 * 7-relation include) first and check ownership on the result afterward, so
 * every unauthorized probe against another user's lead id still paid for
 * the full detail query before being rejected. The ownership check now
 * runs first, as a minimal `select` that only walks Lead -> Campaign.userId
 * — an unauthorized request now costs one cheap indexed lookup instead of
 * the full payload, and only an authorized request pays for the full
 * getLeadById() fetch.
 */
export async function getLeadForUser(db: PrismaClient, userId: string, leadId: string) {
  const ownership = await db.lead.findUnique({ where: { id: leadId }, select: { campaign: { select: { userId: true } } } });
  if (!ownership || ownership.campaign.userId !== userId) {
    throw new NotFoundError("Lead", leadId);
  }

  const lead = await getLeadById(db, leadId);
  if (!lead) {
    // Practically unreachable (the lead existed a moment ago and nothing in
    // this codebase deletes leads), but keeps the return type lead-not-null
    // without an unchecked assertion.
    throw new NotFoundError("Lead", leadId);
  }
  return lead;
}

// GET /api/leads (section 9/24): campaign/status/score-range/
// recommendedService/search + pagination, all applied as indexed Prisma
// WHERE clauses — never fetched in bulk and filtered in application code.
// Scoping through `campaign: { userId }` means a leadId belonging to another
// user's campaign is excluded by the query itself, not by a manual check.
export async function listLeadsForUser(db: PrismaClient, userId: string, query: LeadListQuery): Promise<PaginatedResult<Lead & { business: Business }>> {
  const where: Prisma.LeadWhereInput = {
    campaign: { userId, ...(query.campaignId ? { id: query.campaignId } : {}) },
    ...(query.status ? { status: query.status } : {}),
    ...(query.recommendedService ? { recommendedService: query.recommendedService } : {}),
    ...(query.minScore !== undefined || query.maxScore !== undefined
      ? { score: { ...(query.minScore !== undefined ? { gte: query.minScore } : {}), ...(query.maxScore !== undefined ? { lte: query.maxScore } : {}) } }
      : {}),
    ...(query.search ? { business: { name: { contains: query.search, mode: "insensitive" } } } : {}),
  };

  const [items, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: { business: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.lead.count({ where }),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

// Phase 5: the AI-specific fields a successful /api/leads/:id/analyze call
// adds on top of the deterministic analysis. Optional and additive on
// ApplyLeadAnalysisInput below — existing deterministic-only callers
// (lib/leads/lead.service.test.ts) are unaffected by its absence.
export type AiAnalysisMetadata = {
  summary: string;
  websiteNeed: number;
  whatsappNeed: number;
  reviewAutomationNeed: number;
  voiceAgentNeed: number;
  modelName: string;
  promptVersion: string;
  latencyMs: number;
  repairUsed: boolean;
};

export type ApplyLeadAnalysisInput = {
  leadId: string;
  score: OpportunityScore;
  recommendedService: ServiceCode;
  estimatedDealMin?: number;
  estimatedDealMax?: number;
  aiMetadata?: AiAnalysisMetadata;
};

/**
 * Persists a completed analysis: the LeadScore breakdown, the
 * recommendation/deal estimate on the Lead, an AI analysis attempt record
 * when `aiMetadata` is supplied (Phase 5 section 11/14), and the
 * NEW -> ANALYZED transition (with its LEAD_ANALYZED activity), all in one
 * transaction (section 26/38). Deliberately takes an already-computed
 * OpportunityScore/ServiceCode rather than calling the model itself — score
 * and recommendation stay deterministic and callable without any AI
 * integration (Rule 6/7); lib/ai/lead-analysis.service.ts (Phase 5) is the
 * only caller that passes `aiMetadata`, after the model's response has
 * already passed Zod + business validation. This function never talks to
 * the model and never persists anything that hasn't already been validated —
 * it only writes what it's given.
 */
export async function applyLeadAnalysis(db: PrismaClient, input: ApplyLeadAnalysisInput): Promise<Lead> {
  return db.$transaction(async (tx) => {
    await tx.leadScore.create({
      data: {
        leadId: input.leadId,
        rating: input.score.breakdown.rating,
        reviewVolume: input.score.breakdown.reviewVolume,
        websiteGap: input.score.breakdown.websiteGap,
        socialPresence: input.score.breakdown.socialPresence,
        contactAvailability: input.score.breakdown.contactAvailability,
        businessValue: input.score.breakdown.businessValue,
        localDemand: input.score.breakdown.localDemand,
        dataQuality: input.score.breakdown.dataQuality,
        total: input.score.total,
        classification: input.score.classification,
      },
    });

    await tx.lead.update({
      where: { id: input.leadId },
      data: {
        score: input.score.total,
        recommendedService: input.recommendedService,
        estimatedDealMin: input.estimatedDealMin,
        estimatedDealMax: input.estimatedDealMax,
      },
    });

    if (input.aiMetadata) {
      await tx.leadAnalysis.create({
        data: {
          leadId: input.leadId,
          status: "SUCCESS",
          promptVersion: input.aiMetadata.promptVersion,
          modelName: input.aiMetadata.modelName,
          latencyMs: input.aiMetadata.latencyMs,
          repairUsed: input.aiMetadata.repairUsed,
          summary: input.aiMetadata.summary,
          websiteNeed: input.aiMetadata.websiteNeed,
          whatsappNeed: input.aiMetadata.whatsappNeed,
          reviewAutomationNeed: input.aiMetadata.reviewAutomationNeed,
          voiceAgentNeed: input.aiMetadata.voiceAgentNeed,
          recommendedService: input.recommendedService,
          estimatedDealMin: input.estimatedDealMin,
          estimatedDealMax: input.estimatedDealMax,
        },
      });
    }

    return transitionLeadStatusInTx(tx, { leadId: input.leadId, nextStatus: "ANALYZED" });
  });
}

export type RecordFailedLeadAnalysisInput = {
  leadId: string;
  promptVersion: string;
  modelName: string;
  latencyMs: number;
  repairUsed: boolean;
  /** Sanitized, never a raw exception/stack trace — see lib/ai/lead-analysis.service.ts. */
  errorMessage: string;
};

/**
 * Records a failed AI analysis attempt as a standalone diagnostic row —
 * deliberately NOT part of applyLeadAnalysis's transaction, and touches
 * nothing else: no LeadScore, no Lead field, no Activity, no lifecycle
 * transition (Phase 5 section 13/14/15: "do NOT persist invalid analysis"
 * into the Lead's own state; "AI failure must NOT... corrupt existing
 * analysis... create a false LEAD_ANALYZED activity... transition the
 * lead"). The Lead remains exactly as it was before the attempt, so a
 * later retry stays possible.
 */
export async function recordFailedLeadAnalysis(db: PrismaClient, input: RecordFailedLeadAnalysisInput): Promise<void> {
  await db.leadAnalysis.create({
    data: {
      leadId: input.leadId,
      status: "FAILED",
      promptVersion: input.promptVersion,
      modelName: input.modelName,
      latencyMs: input.latencyMs,
      repairUsed: input.repairUsed,
      errorMessage: input.errorMessage,
    },
  });
}

export type PersistGeneratedPitchInput = {
  leadId: string;
  content: string;
  promptVersion: string;
  modelName: string;
};

/**
 * Persists a successfully validated pitch and records PITCH_GENERATED in
 * one transaction (Phase 7 section 11: "do not create PITCH_GENERATED if
 * generation or persistence fails" — both writes commit together or not
 * at all). Deliberately does NOT transition the lead's status — pitch
 * generation is not PITCHED (section 12); only the existing
 * transitionLeadStatus()-based PATCH /api/leads/:id endpoint may do that.
 *
 * Unlike LeadAnalysis, Pitch.content is a required (non-nullable) column
 * (Phase 1 schema) — there is no failed-attempt counterpart to this
 * function the way recordFailedLeadAnalysis exists for analysis. A failed
 * pitch generation attempt persists nothing at all (see
 * lib/ai/pitch.service.ts) rather than writing a placeholder string into a
 * column meant for genuine pitch copy, or adding a migration to make it
 * nullable purely to accommodate a failure record — documented as a
 * deliberate, minimal choice in the Phase 7 report.
 */
export async function persistGeneratedPitch(db: PrismaClient, input: PersistGeneratedPitchInput): Promise<Pitch> {
  return db.$transaction(async (tx) => {
    const pitch = await tx.pitch.create({
      data: {
        leadId: input.leadId,
        content: input.content,
        promptVersion: input.promptVersion,
        modelName: input.modelName,
        status: "GENERATED",
      },
    });
    await recordActivity(tx, { leadId: input.leadId, type: "PITCH_GENERATED" });
    return pitch;
  });
}

export type ApplyDiscoveryInsightsInput = {
  lead: Pick<Lead, "id">;
  business: Business;
  insights: DiscoveryInsights;
};

/**
 * Stores what the discovery workflow learned about a newly created lead, in
 * one transaction: a deterministic LeadScore (same engine the AI analysis
 * uses), the summary and services, and, when present, the outreach message
 * as a GENERATED Pitch. Lead status is not changed; selection does that.
 */
export async function applyDiscoveryInsights(db: PrismaClient, input: ApplyDiscoveryInsightsInput): Promise<void> {
  const { business, insights } = input;
  const score = calculateOpportunityScore({
    rating: business.rating,
    reviewCount: business.reviewCount,
    website: business.website,
    instagram: business.instagram,
    facebook: business.facebook,
    phone: business.phone,
    email: business.email,
    address: business.address,
    city: business.city,
    latitude: business.latitude,
    longitude: business.longitude,
  });

  await db.$transaction(async (tx) => {
    await tx.leadScore.create({
      data: {
        leadId: input.lead.id,
        rating: score.breakdown.rating,
        reviewVolume: score.breakdown.reviewVolume,
        websiteGap: score.breakdown.websiteGap,
        socialPresence: score.breakdown.socialPresence,
        contactAvailability: score.breakdown.contactAvailability,
        businessValue: score.breakdown.businessValue,
        localDemand: score.breakdown.localDemand,
        dataQuality: score.breakdown.dataQuality,
        total: score.total,
        classification: score.classification,
      },
    });

    await tx.lead.update({
      where: { id: input.lead.id },
      data: {
        score: score.total,
        ...(insights.summary ? { summary: insights.summary } : {}),
        ...(insights.services?.length ? { services: insights.services } : {}),
      },
    });

    if (insights.outreachMessage) {
      await tx.pitch.create({
        data: {
          leadId: input.lead.id,
          content: insights.outreachMessage,
          promptVersion: DISCOVERY_PITCH_PROMPT_VERSION,
          modelName: insights.model ?? "unknown",
          status: "GENERATED",
        },
      });
      await recordActivity(tx, { leadId: input.lead.id, type: "PITCH_GENERATED" });
    }
  });
}
