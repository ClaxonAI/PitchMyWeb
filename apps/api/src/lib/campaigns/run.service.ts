import type { Campaign, CampaignExecution, CampaignStatus, Prisma, PrismaClient } from "@pitchmyweb/db";
import { isCampaignTransitionAllowed, loadOwnedCampaign, prepareCampaignRun } from "./campaign.service";
import { applyDiscoveryInsights, ingestBusinessAsLead } from "../leads/lead.service";
import { onDiscoveryCompleted } from "./selection.service";
import { ConflictError } from "../errors";
import { DemoProvider, type CampaignSearchInput } from "../providers/demo-provider";
import { getLeadProvider, isAsyncLeadProvider, type AnyLeadProvider } from "../providers";
import { matchesCampaignFilters } from "./campaign-filters";
import { normalizePhoneForWhatsApp } from "../leads/whatsapp.service";
import { businessProviderInputSchema, type BusinessProviderInput } from "../validation/business";
import { emitEvent } from "../observability/events";

// POST /api/campaigns/:id/run domain service (section 8/44). Composes
// already-existing Phase 3 services — it does not reimplement normalization,
// dedup, lead creation, or activity recording:
//
//   prepareCampaignRun (DB-atomic RUNNING guard, fixed in campaign.service.ts)
//     -> provider
//          sync  (DemoProvider): search() -> ingestBusinesses -> finalizeExecution
//          async (osm):          trigger() -> execution stays RUNNING; results
//                                arrive later via POST
//                                /api/internal/pipeline/discovery-results,
//                                which calls ingestBusinesses / finalizeExecution
//     -> ingestBusinessAsLead (normalize -> dedupe -> createLead -> LEAD_CREATED)
//
// per business, with per-business failures isolated (section 40: "one bad
// lead: skip/retry that lead; campaign continues").

export type RunCampaignOptions = {
  idempotencyKey?: string;
  // Phase 4 code-review finding #7: the provider is injectable so tests and
  // alternative sources don't require editing this file. When omitted, the
  // provider configured by LEAD_PROVIDER is used (SerperLeadProvider by default).
  provider?: AnyLeadProvider;
};

export type FailedBusinessDetail = {
  name: string;
  externalId: string | null;
  error: string;
};

export type RunCampaignResult = {
  campaign: Campaign;
  execution: CampaignExecution;
};

/** Cap on stored failure details, so a pathological run can't grow one JSON column without bound. */
export const MAX_FAILED_BUSINESS_DETAILS = 500;

function toCampaignSearchInput(campaign: Campaign): CampaignSearchInput {
  return {
    location: campaign.location,
    category: campaign.category,
    radius: campaign.radius,
    minRating: campaign.minRating,
    minReviews: campaign.minReviews,
    websiteRequirement: campaign.websiteRequirement,
    leadLimit: campaign.leadLimit,
  };
}

async function findReplayableExecution(db: PrismaClient, campaignId: string, idempotencyKey: string): Promise<CampaignExecution | null> {
  return db.campaignExecution.findUnique({
    where: { campaignId_idempotencyKey: { campaignId, idempotencyKey } },
  });
}

/**
 * Phase 4 code-review finding #13: a replay of an execution that is still
 * RUNNING returns an explicit 409 ("still in progress, retry later") rather
 * than a confusing placeholder snapshot; only a finished execution
 * (COMPLETED/FAILED) is replayed. For async providers this also covers a
 * retry that lands while the discovery worker is still working.
 */
async function replayExecution(db: PrismaClient, fallbackCampaign: Campaign, execution: CampaignExecution): Promise<RunCampaignResult> {
  if (execution.status === "RUNNING") {
    throw new ConflictError("A run with this idempotency key is already in progress. Retry shortly.");
  }
  const current = await db.campaign.findUnique({ where: { id: fallbackCampaign.id } });
  return { campaign: current ?? fallbackCampaign, execution };
}

// ---------------------------------------------------------------------------
// Ingestion (shared by the sync path and the discovery-results callback)
// ---------------------------------------------------------------------------

export type IngestResult = {
  leadsCreated: number;
  failedCount: number;
  failedBusinesses: FailedBusinessDetail[];
};

/**
 * Bound on the history loaded into memory on a discovery callback. A user
 * with more leads than this stops gaining new repeat-protection rather than
 * loading an unbounded set.
 */
export const MAX_SEEN_BUSINESSES = 20_000;

/** Leads this campaign already has that WhatsApp could actually reach. */
async function countPitchableLeads(db: PrismaClient, campaignId: string): Promise<number> {
  const leads = await db.lead.findMany({
    where: { campaignId },
    select: { business: { select: { phone: true } } },
    take: MAX_SEEN_BUSINESSES,
  });
  return leads.filter((lead) => normalizePhoneForWhatsApp(lead.business.phone)).length;
}

async function seenBusinessKeys(db: PrismaClient, campaign: Campaign): Promise<Set<string>> {
  const leads = await db.lead.findMany({
    where: { campaign: { userId: campaign.userId }, campaignId: { not: campaign.id } },
    select: { businessId: true },
    take: MAX_SEEN_BUSINESSES,
  });
  return new Set(leads.map((lead) => lead.businessId));
}

/**
 * Ingests raw provider records for one execution, stopping once the campaign
 * has targetCount leads that can actually be pitched. `alreadyCreated` is the
 * number of leads this execution has already produced (from earlier batches),
 * so the search budget is enforced across the whole run.
 *
 * Two different limits are at work. targetCount is the promise to the user —
 * how many usable leads they asked for — and is counted against leads whose
 * business has a WhatsApp-reachable number. leadLimit is the search budget:
 * how many candidates may be looked at while trying to fill that promise,
 * which has to be larger because candidates get discarded for reasons the
 * search cannot see (already a lead from an earlier campaign, no phone, or
 * failing the campaign's own filters).
 */
export async function ingestBusinesses(
  db: PrismaClient,
  campaign: Campaign,
  executionId: string,
  records: readonly unknown[],
  alreadyCreated = 0,
): Promise<IngestResult> {
  let leadsCreated = 0;
  let failedCount = 0;
  const failedBusinesses: FailedBusinessDetail[] = [];

  // Businesses this user has already been given as a lead in some earlier
  // campaign. Discovery keeps finding the same well-known places run after
  // run — the per-campaign @@unique([campaignId, businessId]) does not stop
  // that, it only stops a repeat inside one campaign — so without this the
  // second campaign for a category is largely the first one again.
  const alreadySeen = await seenBusinessKeys(db, campaign);

  // What the user asked for is targetCount leads they can actually pitch, so
  // that is what the cap counts. A business with no WhatsApp-reachable
  // number is still stored — the dashboard shows it with a reason rather
  // than hiding it — but it does not consume one of the slots, and the
  // search keeps going to replace it.
  let pitchable = await countPitchableLeads(db, campaign.id);

  for (const providerInput of records) {
    if (pitchable >= campaign.targetCount) break;
    // Bound on how many candidates may be looked at, so a campaign whose
    // results are nearly all unreachable or already-seen stops rather than
    // ingesting the entire result set.
    if (alreadyCreated + leadsCreated >= campaign.leadLimit) break;

    try {
      // Section 6: validate structural correctness *before* filtering, so a
      // malformed record is always caught as a failed business rather than
      // silently failing the filter predicate and looking "not eligible."
      const validated = businessProviderInputSchema.parse(providerInput);

      // Defense-in-depth (section 8): re-verify every provider result
      // against the campaign's own filters rather than assuming the
      // provider (demo or osm) filtered correctly. A non-matching business
      // is simply not eligible — not a failure, not counted either way.
      if (!matchesCampaignFilters(validated, campaign)) continue;

      const { leadCreated, lead, business } = await ingestBusinessAsLead(db, { campaignId: campaign.id, providerInput: validated });

      // Ingestion resolves the business first, so a repeat is only
      // recognisable once we have its id. Undo the lead rather than leave
      // the user looking at a business they were already sold.
      if (leadCreated && alreadySeen.has(business.id)) {
        await db.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
        continue;
      }
      if (leadCreated) {
        alreadySeen.add(business.id);
        if (normalizePhoneForWhatsApp(business.phone)) pitchable += 1;
      }
      if (leadCreated) {
        leadsCreated += 1;
        if (validated.insights) {
          // The lead exists either way; insights are an enrichment, so a
          // problem storing them is logged rather than failing the business.
          await applyDiscoveryInsights(db, { lead, business, insights: validated.insights }).catch((error: unknown) => {
            console.error(`Campaign run ${executionId}: could not store insights for lead ${lead.id}:`, error);
          });
        }
      }
    } catch (error) {
      failedCount += 1;
      const rawInput = providerInput as Partial<BusinessProviderInput> | null | undefined;
      const name = typeof rawInput?.name === "string" ? rawInput.name : "Unknown business";
      const externalId = typeof rawInput?.externalId === "string" ? rawInput.externalId : null;
      const message = error instanceof Error ? error.message : "Unknown error";
      failedBusinesses.push({ name, externalId, error: message });
      console.error(`Campaign run ${executionId}: failed to ingest business "${name}" (${externalId ?? "no externalId"}):`, error);
    }
  }

  return { leadsCreated, failedCount, failedBusinesses };
}

export function mergeFailedBusinesses(existing: unknown, added: FailedBusinessDetail[]): FailedBusinessDetail[] {
  const previous = Array.isArray(existing) ? (existing as FailedBusinessDetail[]) : [];
  return [...previous, ...added].slice(0, MAX_FAILED_BUSINESS_DETAILS);
}

// ---------------------------------------------------------------------------
// Finalization (shared)
// ---------------------------------------------------------------------------

export type ExecutionTotals = {
  businessesFound: number;
  leadsCreated: number;
  failedCount: number;
  failedBusinesses: FailedBusinessDetail[];
};

/**
 * Phase 4 code-review finding #5: "found something, attempted it, and every
 * attempt failed" is the FAILED signal. Zero eligible businesses (nothing
 * attempted, nothing failed) is still a normal COMPLETED run.
 */
export function decideOutcome(totals: ExecutionTotals, topLevelError: string | null): { status: "COMPLETED" | "FAILED"; errorMessage: string | null } {
  const allAttemptedBusinessesFailed = totals.businessesFound > 0 && totals.leadsCreated === 0 && totals.failedCount > 0;
  const status = topLevelError || allAttemptedBusinessesFailed ? "FAILED" : "COMPLETED";
  const errorMessage = topLevelError ?? (allAttemptedBusinessesFailed ? `All ${totals.failedCount} attempted businesses failed to ingest.` : null);
  return { status, errorMessage };
}

/**
 * Commits the final Campaign + CampaignExecution status pair in one
 * transaction (Phase 4 code-review findings #3/#4/#16), so the two rows can
 * never diverge from a partial write. `topLevelError` must already be a
 * fixed, sanitized message (finding #8) — never a raw upstream error.
 */
export async function finalizeExecution(
  db: PrismaClient,
  campaign: Pick<Campaign, "id" | "status">,
  executionId: string,
  totals: ExecutionTotals,
  topLevelError: string | null,
  /** Fixed, machine-readable failure reason for logs/alerts (never raw error text). */
  failureReason?: string,
): Promise<RunCampaignResult> {
  const { status, errorMessage } = decideOutcome(totals, topLevelError);

  const campaignStatus: CampaignStatus = campaign.status;
  if (!isCampaignTransitionAllowed(campaignStatus, status)) {
    throw new Error(`Internal invariant violated: cannot move campaign ${campaign.id} from ${campaignStatus} to ${status}`);
  }

  const [finalCampaign, finalExecution] = await db.$transaction([
    db.campaign.update({ where: { id: campaign.id }, data: { status } }),
    db.campaignExecution.update({
      where: { id: executionId },
      data: {
        status,
        businessesFound: totals.businessesFound,
        leadsCreated: totals.leadsCreated,
        failedCount: totals.failedCount,
        failedBusinesses: totals.failedBusinesses.length > 0 ? (totals.failedBusinesses as unknown as Prisma.InputJsonValue) : undefined,
        errorMessage,
        completedAt: new Date(),
        ingestLeaseUntil: null,
      },
    }),
  ]);

  const fields = {
    executionId: finalExecution.id,
    campaignId: finalCampaign.id,
    provider: finalExecution.provider,
    businessesFound: finalExecution.businessesFound,
    leadsCreated: finalExecution.leadsCreated,
    failedCount: finalExecution.failedCount,
  };
  if (status === "FAILED") {
    const reason = failureReason ?? (topLevelError ? "provider_error" : "all_businesses_failed");
    // Only external providers page someone; demo/custom runs are dev noise.
    const alert = finalExecution.provider !== "demo" && finalExecution.provider !== "custom";
    emitEvent("lead_discovery.run_failed", { ...fields, reason }, { level: "error", alert });
  } else {
    emitEvent("lead_discovery.run_completed", fields);
    // Auto-select campaigns move straight on to building sites.
    await onDiscoveryCompleted(db, finalCampaign.id);
  }

  return { campaign: finalCampaign, execution: finalExecution };
}

export function totalsFromExecution(execution: CampaignExecution): ExecutionTotals {
  return {
    businessesFound: execution.businessesFound,
    leadsCreated: execution.leadsCreated,
    failedCount: execution.failedCount,
    failedBusinesses: mergeFailedBusinesses(execution.failedBusinesses, []),
  };
}

// ---------------------------------------------------------------------------
// Ingest lease (async runs)
// ---------------------------------------------------------------------------

export const INGEST_LEASE_MS = 2 * 60 * 1000;

/**
 * Claims exclusive processing rights on a RUNNING execution for a short
 * time. Webhook deliveries update running totals with read-modify-write, and
 * ingestBusinessAsLead manages its own transactions, so deliveries for the
 * same execution are serialised with this lease instead of one wrapping
 * transaction. The lease expires on its own if a process dies mid-batch.
 */
export async function acquireIngestLease(db: PrismaClient, executionId: string, now = new Date()): Promise<boolean> {
  const { count } = await db.campaignExecution.updateMany({
    where: {
      id: executionId,
      status: "RUNNING",
      OR: [{ ingestLeaseUntil: null }, { ingestLeaseUntil: { lt: now } }],
    },
    data: { ingestLeaseUntil: new Date(now.getTime() + INGEST_LEASE_MS) },
  });
  return count === 1;
}

export async function releaseIngestLease(db: PrismaClient, executionId: string): Promise<void> {
  await db.campaignExecution.updateMany({ where: { id: executionId }, data: { ingestLeaseUntil: null } });
}

// ---------------------------------------------------------------------------
// Stale async runs
// ---------------------------------------------------------------------------

export const DEFAULT_EXECUTION_TIMEOUT_MINUTES = 30;
export const EXECUTION_TIMEOUT_MESSAGE = "Timed out waiting for lead discovery results.";

function executionTimeoutMinutes(): number {
  const parsed = Number(process.env.ASYNC_EXECUTION_TIMEOUT_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXECUTION_TIMEOUT_MINUTES;
}

/**
 * Fails async executions that were triggered but never reported back
 * (the workflow crashed, was deactivated, or its callback could not reach
 * us). Only triggered runs are considered (`triggeredAt` is set solely by
 * the async path), so an in-flight synchronous run is never touched.
 * Returns how many executions were expired.
 */
export async function expireStaleExecutions(db: PrismaClient, options: { now?: Date; timeoutMinutes?: number; campaignId?: string } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.timeoutMinutes ?? executionTimeoutMinutes()) * 60 * 1000);

  const stale = await db.campaignExecution.findMany({
    where: {
      status: "RUNNING",
      triggeredAt: { lt: cutoff },
      ...(options.campaignId ? { campaignId: options.campaignId } : {}),
    },
    include: { campaign: { select: { id: true, status: true } } },
    take: 50,
  });

  let expired = 0;
  for (const execution of stale) {
    if (!(await acquireIngestLease(db, execution.id, now))) continue;
    try {
      await finalizeExecution(db, execution.campaign, execution.id, totalsFromExecution(execution), EXECUTION_TIMEOUT_MESSAGE, "timeout");
      expired += 1;
    } catch (error) {
      await releaseIngestLease(db, execution.id);
      console.error(`Could not expire stale execution ${execution.id}:`, error);
    }
  }
  return expired;
}

// ---------------------------------------------------------------------------
// runCampaign
// ---------------------------------------------------------------------------

/**
 * Runs a campaign against the configured lead provider.
 * Idempotency/concurrency strategy (section 8/37, no in-memory lock):
 *
 * 1. If the caller supplied an idempotencyKey and a finished
 *    CampaignExecution already exists for (campaignId, idempotencyKey),
 *    that exact prior result is replayed unchanged.
 * 2. Otherwise, prepareCampaignRun's atomic conditional UPDATE is the
 *    concurrency gate: only one concurrent request can ever observe
 *    success from it for a given campaign.
 * 3. Phase 4 code-review finding #14: the loser of a same-key race takes
 *    one more look for a matching execution before propagating the 409.
 *
 * Sync providers finish inside this call (COMPLETED/FAILED). Async
 * providers return with the campaign PROCESSING and the execution RUNNING;
 * if the trigger itself fails, the run is finalized as FAILED right away.
 *
 * The multi-business ingestion loop is deliberately NOT inside one
 * all-or-nothing transaction: each ingestBusinessAsLead call is its own
 * atomic unit, so one business failing never rolls back the businesses
 * already ingested (section 40).
 */
export async function runCampaign(db: PrismaClient, userId: string, campaignId: string, options: RunCampaignOptions = {}): Promise<RunCampaignResult> {
  // Resolved first: a misconfigured provider fails before any state changes.
  const provider = options.provider ?? getLeadProvider();
  const owned = await loadOwnedCampaign(db, campaignId, userId);

  if (options.idempotencyKey) {
    const existing = await findReplayableExecution(db, owned.id, options.idempotencyKey);
    if (existing) {
      return replayExecution(db, owned, existing);
    }
  }

  let running: Campaign;
  try {
    running = await prepareCampaignRun(db, userId, campaignId);
  } catch (error) {
    if (options.idempotencyKey) {
      const existing = await findReplayableExecution(db, owned.id, options.idempotencyKey);
      if (existing) {
        return replayExecution(db, owned, existing);
      }
    }
    throw error;
  }

  if (!isCampaignTransitionAllowed(running.status, "PROCESSING")) {
    throw new Error(`Internal invariant violated: cannot move campaign ${running.id} from ${running.status} to PROCESSING`);
  }

  const providerName = isAsyncLeadProvider(provider) ? provider.name : provider instanceof DemoProvider ? "demo" : "custom";
  const [execution, processing] = await db.$transaction([
    db.campaignExecution.create({
      data: { campaignId: running.id, idempotencyKey: options.idempotencyKey ?? null, status: "RUNNING", provider: providerName },
    }),
    db.campaign.update({ where: { id: running.id }, data: { status: "PROCESSING" } }),
  ]);

  if (isAsyncLeadProvider(provider)) {
    try {
      const { externalRunId } = await provider.trigger(processing, execution);
      const triggered = await db.campaignExecution.update({
        where: { id: execution.id },
        data: { triggeredAt: new Date(), externalRunId },
      });
      emitEvent("lead_discovery.run_started", { executionId: triggered.id, campaignId: processing.id, provider: provider.name, externalRunId });
      return { campaign: processing, execution: triggered };
    } catch (error) {
      console.error(`Campaign run ${execution.id}: could not trigger ${provider.name}:`, error);
      emitEvent("lead_discovery.trigger_failed", { executionId: execution.id, campaignId: processing.id, provider: provider.name }, { level: "error" });
      return finalizeExecution(
        db,
        processing,
        execution.id,
        { businessesFound: 0, leadsCreated: 0, failedCount: 0, failedBusinesses: [] },
        "Lead discovery could not be started. You can retry later.",
        "trigger_failed",
      );
    }
  }

  let businessesFound = 0;
  let ingest: IngestResult = { leadsCreated: 0, failedCount: 0, failedBusinesses: [] };
  let topLevelError: string | null = null;

  try {
    const businesses = await provider.search(toCampaignSearchInput(processing));
    businessesFound = businesses.length;
    ingest = await ingestBusinesses(db, processing, execution.id, businesses);
  } catch (error) {
    // Phase 4 code-review finding #8: only a fixed, generic message is ever
    // persisted/returned; the real error is still logged server-side.
    console.error(`Campaign run ${execution.id}: provider search failed:`, error);
    topLevelError = "Business discovery failed. See server logs for details.";
  }

  return finalizeExecution(
    db,
    processing,
    execution.id,
    { businessesFound, leadsCreated: ingest.leadsCreated, failedCount: ingest.failedCount, failedBusinesses: ingest.failedBusinesses },
    topLevelError,
  );
}
