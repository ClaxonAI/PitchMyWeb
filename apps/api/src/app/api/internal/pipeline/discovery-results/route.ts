import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@pitchmyweb/db";
import { prisma } from "../../../../../lib/db/client";
import { parseJsonBody } from "../../../../../lib/api/request";
import { errorResponse, jsonOk } from "../../../../../lib/api/response";
import { requireJobSecret } from "../../../../../lib/jobs/job-auth";
import { discoveryResultsSchema } from "../../../../../lib/validation/discovery";
import { ingestBusinesses, finalizeExecution, totalsFromExecution, mergeFailedBusinesses } from "../../../../../lib/campaigns/run.service";
import { NotFoundError, ValidationError } from "../../../../../lib/errors";
import { emitEvent } from "../../../../../lib/observability/events";

// Fixed, machine-readable failure reason — the worker's own error text is
// logged server-side only, never persisted or returned to any client.
export const DISCOVERY_WORKER_FAILURE_MESSAGE = "The business discovery worker reported a failure.";

// POST /api/internal/pipeline/discovery-results
//   Authorization: Bearer <INTERNAL_JOBS_SECRET>
//   { executionId, businesses } on success, or { executionId, error } on failure
// Sent once by apps/discovery-worker after it finishes (or fails) searching
// for one campaign execution — exactly one delivery per execution, so this
// needs no idempotency-key/lease machinery, just the same "already resolved
// -> no-op" idempotent-skip process-recording.ts uses.
// Every ingested business flows through ingestBusinesses ->
// ingestBusinessAsLead -> resolveBusiness, i.e. Phase 2A's dedup cascade,
// automatically.
export async function handleDiscoveryResults(db: PrismaClient, request: NextRequest, secret?: string): Promise<NextResponse> {
  requireJobSecret(request, secret);
  const body = await parseJsonBody(request, discoveryResultsSchema);

  if (body.businesses === undefined && body.error === undefined) {
    throw new ValidationError("Either businesses or error must be provided");
  }
  if (body.businesses !== undefined && body.error !== undefined) {
    throw new ValidationError("businesses and error are mutually exclusive");
  }

  const execution = await db.campaignExecution.findUnique({ where: { id: body.executionId }, include: { campaign: true } });
  if (!execution) throw new NotFoundError("CampaignExecution", body.executionId);

  if (execution.status !== "RUNNING") {
    // Already resolved (duplicate/retried callback) — safe to no-op.
    return jsonOk({ ok: true, duplicate: true, executionId: execution.id, status: execution.status });
  }

  if (body.error !== undefined) {
    console.error(`Discovery worker reported failure for execution ${execution.id}: ${body.error}`);
    const { execution: finished } = await finalizeExecution(
      db,
      execution.campaign,
      execution.id,
      totalsFromExecution(execution),
      DISCOVERY_WORKER_FAILURE_MESSAGE,
      "discovery_worker_failed",
    );
    return jsonOk({ ok: true, duplicate: false, executionId: finished.id, status: finished.status });
  }

  const businesses = body.businesses ?? [];
  const result = await ingestBusinesses(db, execution.campaign, execution.id, businesses, execution.leadsCreated);
  const failedBusinesses = mergeFailedBusinesses(execution.failedBusinesses, result.failedBusinesses);
  const totals = {
    businessesFound: execution.businessesFound + businesses.length,
    leadsCreated: execution.leadsCreated + result.leadsCreated,
    failedCount: execution.failedCount + result.failedCount,
    failedBusinesses,
  };

  const { execution: finished } = await finalizeExecution(db, execution.campaign, execution.id, totals, null);

  emitEvent("lead_discovery.run_completed", {
    executionId: execution.id,
    campaignId: execution.campaignId,
    provider: "osm",
    businessesFound: totals.businessesFound,
    leadsCreated: totals.leadsCreated,
    failedCount: totals.failedCount,
  });

  return jsonOk({ ok: true, duplicate: false, executionId: finished.id, status: finished.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleDiscoveryResults(prisma, request);
  } catch (error) {
    return errorResponse(error);
  }
}
