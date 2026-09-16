import type { Campaign, CampaignExecution, Prisma, PrismaClient } from "../../generated/prisma/client";
import { isCampaignTransitionAllowed, loadOwnedCampaign, prepareCampaignRun } from "./campaign.service";
import { ingestBusinessAsLead } from "../leads/lead.service";
import { ConflictError } from "../errors";
import { DemoProvider, type CampaignSearchInput, type LeadProvider } from "../providers/demo-provider";
import { matchesCampaignFilters } from "./campaign-filters";
import { businessProviderInputSchema, type BusinessProviderInput } from "../validation/business";

// POST /api/campaigns/:id/run domain service (section 8/44). Composes
// already-existing Phase 3 services — it does not reimplement normalization,
// dedup, lead creation, or activity recording:
//
//   prepareCampaignRun (DB-atomic RUNNING guard, fixed in campaign.service.ts)
//     -> LeadProvider.search (DemoProvider by default for V1)
//     -> ingestBusinessAsLead (normalize -> dedupe -> createLead -> LEAD_CREATED)
//
// per business, with per-business failures isolated (section 40: "one bad
// lead: skip/retry that lead; campaign continues").

export type RunCampaignOptions = {
  idempotencyKey?: string;
  // Phase 4 code-review finding #7: runCampaign used to construct
  // `new DemoProvider()` directly inline, so there was no way to run it
  // against a different/controllable LeadProvider — either a future real
  // provider or a test double — without editing this file. Optional and
  // defaults to DemoProvider so every existing caller/route is unaffected;
  // this does not change *when* the search happens (still synchronous
  // inside this call — see the note below), only *what* is called.
  provider?: LeadProvider;
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
 * Phase 4 code-review finding #13: a naive replay used to return whatever
 * the matching CampaignExecution row currently held, even mid-flight — a
 * retry landing while the original request is still inside its ingestion
 * loop got back a misleading `status:"RUNNING", leadsCreated:0` snapshot
 * that looks like nothing happened. An execution still RUNNING now returns
 * an explicit 409 ("still in progress, retry later") instead of a
 * confusing 200 with placeholder counts; only a finished execution
 * (COMPLETED/FAILED) is replayed.
 */
async function replayExecution(db: PrismaClient, fallbackCampaign: Campaign, execution: CampaignExecution): Promise<RunCampaignResult> {
  if (execution.status === "RUNNING") {
    throw new ConflictError("A run with this idempotency key is already in progress. Retry shortly.");
  }
  const current = await db.campaign.findUnique({ where: { id: fallbackCampaign.id } });
  return { campaign: current ?? fallbackCampaign, execution };
}

/**
 * Runs a campaign against a LeadProvider (DemoProvider by default for V1).
 * Idempotency/concurrency strategy (section 8/37, no in-memory lock):
 *
 * 1. If the caller supplied an idempotencyKey and a finished
 *    CampaignExecution already exists for (campaignId, idempotencyKey),
 *    that exact prior result is replayed unchanged.
 * 2. Otherwise, prepareCampaignRun's atomic conditional UPDATE is the
 *    concurrency gate: only one concurrent request can ever observe
 *    success from it for a given campaign.
 * 3. Phase 4 code-review finding #14: two requests carrying the *same*
 *    idempotencyKey that arrive at nearly the same instant can both miss
 *    step 1 (neither sees the other's execution row yet) and both reach
 *    step 2, where only one wins the atomic guard. The loser now takes one
 *    more look for a matching execution before propagating the 409 — by
 *    the time it lost the race, the winner has very likely already created
 *    its execution row, so this closes most of that window without a
 *    bigger redesign (a lock/queue). It cannot close it completely: if the
 *    loser's second lookup still runs before the winner's create commits,
 *    it still gets the 409, and the caller's own retry (now finding a
 *    completed execution) resolves it.
 *
 * Transaction boundaries (Phase 4 code-review finding #3/#4/#16): the two
 * points where this function commits a Campaign+CampaignExecution status
 * pair (claiming PROCESSING, and recording the final COMPLETED/FAILED
 * result) are each wrapped in `db.$transaction([...])` so the two rows can
 * never diverge from a partial write. The multi-business ingestion loop in
 * between is deliberately NOT inside a single all-or-nothing transaction:
 * each ingestBusinessAsLead call is its own atomic unit, so one business
 * failing never rolls back the businesses already successfully ingested in
 * the same run (section 40's partial-failure requirement would otherwise
 * be violated by the "safety" of one giant transaction). A process crash
 * between the two transactional checkpoints can still leave a campaign
 * stuck in RUNNING/PROCESSING with no automatic recovery path — fully
 * closing that gap would need an async job/reconciliation mechanism, which
 * is a larger architectural change intentionally out of scope for this
 * fix pass (see the Phase 4 findings-fix report).
 *
 * Business-level failures are caught per-item: one throwing business does
 * not roll back the businesses already ingested in this run, does not fail
 * the campaign by itself, and is both counted (`failedCount`) and recorded
 * with enough detail to investigate later (`failedBusinesses`, finding #6)
 * rather than only being logged (section 40: "do not silently swallow
 * failures"). Phase 4 code-review finding #5: if *every* discovered
 * business fails, the run is now reported FAILED rather than COMPLETED —
 * a 100%-failure run no longer looks identical to a success at the
 * campaign-status level.
 *
 * Note on synchronous execution (architecture finding #7): section 8 says
 * the backend "should not perform the entire long-running workflow
 * synchronously." For V1 the default DemoProvider is an in-memory, bounded,
 * near-instant data source — there is no real long-running orchestration to
 * defer, and no n8n trigger contract exists yet to hand this off to (Phase
 * 6, explicitly out of scope for this task). Accepting an injected
 * `provider` (above) is the DI half of that finding's fix; actually moving
 * ingestion off the request path would require an async job queue, which
 * is an architecture change, not a targeted fix, and is documented as a
 * remaining/deferred item rather than silently left unaddressed.
 */
export async function runCampaign(db: PrismaClient, userId: string, campaignId: string, options: RunCampaignOptions = {}): Promise<RunCampaignResult> {
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

  const [execution, processing] = await db.$transaction([
    db.campaignExecution.create({
      data: { campaignId: running.id, idempotencyKey: options.idempotencyKey ?? null, status: "RUNNING" },
    }),
    db.campaign.update({ where: { id: running.id }, data: { status: "PROCESSING" } }),
  ]);

  let businessesFound = 0;
  let leadsCreated = 0;
  let failedCount = 0;
  const failedBusinesses: FailedBusinessDetail[] = [];
  let topLevelError: string | null = null;

  try {
    const provider = options.provider ?? new DemoProvider();
    const businesses = await provider.search(toCampaignSearchInput(processing));
    businessesFound = businesses.length;

    for (const providerInput of businesses) {
      // leadLimit (section 10) is enforced here, against genuinely created
      // leads, not against the raw provider result count — stopping the
      // loop once the limit is reached means it can never be exceeded,
      // while still giving every earlier candidate in the list a chance to
      // fill the limit if some ahead of it turn out to be duplicates or
      // fail (see IngestBusinessAsLeadResult.leadCreated below).
      if (leadsCreated >= processing.leadLimit) break;

      try {
        // Section 6: validate structural correctness *before* filtering.
        // ingestBusinessAsLead() also validates internally, but doing it
        // here first means a structurally malformed record (missing/wrong-
        // typed fields) is always caught as a failed business — if
        // validation ran after (or only inside) the filter check, a
        // malformed record with e.g. a missing `category` could silently
        // fail the filter predicate instead (undefined just doesn't match
        // a substring) and be mistaken for "not eligible" rather than
        // "broken."
        const validated = businessProviderInputSchema.parse(providerInput);

        // Defense-in-depth (section 8): re-verify every provider result
        // against the campaign's own filters with the same shared
        // predicate DemoProvider itself uses, rather than assuming the
        // provider filtered correctly. A business that fails this check is
        // simply not eligible — not a failure, not counted either way, the
        // same as if the provider had never returned it.
        if (!matchesCampaignFilters(validated, processing)) continue;

        const { leadCreated } = await ingestBusinessAsLead(db, { campaignId: processing.id, providerInput: validated });
        if (leadCreated) leadsCreated += 1;
      } catch (error) {
        failedCount += 1;
        const rawInput = providerInput as Partial<BusinessProviderInput> | null | undefined;
        const name = typeof rawInput?.name === "string" ? rawInput.name : "Unknown business";
        const externalId = typeof rawInput?.externalId === "string" ? rawInput.externalId : null;
        const message = error instanceof Error ? error.message : "Unknown error";
        failedBusinesses.push({ name, externalId, error: message });
        console.error(`Campaign run ${execution.id}: failed to ingest business "${name}" (${externalId ?? "no externalId"}):`, error);
      }
    }
  } catch (error) {
    // Phase 4 code-review finding #8: the caught error's raw message used
    // to be persisted and returned verbatim in the API response, bypassing
    // errorResponse()'s sanitization that every other error path goes
    // through. Only a fixed, generic message is ever persisted/returned;
    // the real error is still logged server-side for debugging.
    console.error(`Campaign run ${execution.id}: provider search failed:`, error);
    topLevelError = "Business discovery failed. See server logs for details.";
  }

  // Phase 4 code-review finding #5, restated for the filter/leadLimit-aware
  // loop above: "found something, attempted it, and every attempt failed"
  // is the FAILED signal — not "failedCount equals the raw provider
  // count," which would be wrong now that some found businesses can be
  // legitimately skipped (filtered out, or past leadLimit) without ever
  // being attempted. Zero eligible businesses (nothing attempted, nothing
  // failed) is still a normal COMPLETED run, not a failure.
  const allAttemptedBusinessesFailed = businessesFound > 0 && leadsCreated === 0 && failedCount > 0;
  const finalStatus = topLevelError || allAttemptedBusinessesFailed ? "FAILED" : "COMPLETED";
  const finalErrorMessage = topLevelError ?? (allAttemptedBusinessesFailed ? `All ${failedCount} attempted businesses failed to ingest.` : null);

  if (!isCampaignTransitionAllowed(processing.status, finalStatus)) {
    throw new Error(`Internal invariant violated: cannot move campaign ${processing.id} from ${processing.status} to ${finalStatus}`);
  }

  const [finalCampaign, finalExecution] = await db.$transaction([
    db.campaign.update({ where: { id: processing.id }, data: { status: finalStatus } }),
    db.campaignExecution.update({
      where: { id: execution.id },
      data: {
        status: finalStatus,
        businessesFound,
        leadsCreated,
        failedCount,
        failedBusinesses: failedBusinesses.length > 0 ? (failedBusinesses as unknown as Prisma.InputJsonValue) : undefined,
        errorMessage: finalErrorMessage,
        completedAt: new Date(),
      },
    }),
  ]);

  return { campaign: finalCampaign, execution: finalExecution };
}
