import type { DiscoveryEvent } from "@pitchmyweb/contracts";
import type { BusinessDiscoverySource, DiscoveredBusiness, DiscoveryQuery } from "./sources/index.js";

// One discovery job, end to end:
//   fetch execution+campaign search params -> source.search() -> report
//   results (or a fixed failure reason) back to apps/api
//
// No local state to manage (unlike apps/recorder-worker's DemoRecording) —
// apps/api's discovery-results endpoint owns the CampaignExecution/Campaign
// state transitions and, transitively, every discovered business's path
// through the Phase 2A dedup cascade.

export type JobParams = {
  executionId: string;
  location: string;
  category: string;
  radius: number | null;
  minRating: number | null;
  minReviews: number | null;
  leadLimit: number;
};

export type ProcessDeps = {
  source: BusinessDiscoverySource;
  fetchJobParams: (executionId: string) => Promise<JobParams | null>;
  reportResults: (executionId: string, businesses: DiscoveredBusiness[]) => Promise<void>;
  reportFailure: (executionId: string, error: string) => Promise<void>;
  log: (level: "info" | "warn" | "error", fields: Record<string, unknown>, message: string) => void;
  publish?: (event: DiscoveryEvent) => Promise<void>;
};

export type ProcessOutcome = "completed" | "failed" | "skipped";

/** A `retryable: false` error (a bad location string, a malformed query) will never succeed on retry. */
function isPermanent(error: unknown): boolean {
  return error instanceof Error && "retryable" in error && (error as Error & { retryable?: boolean }).retryable === false;
}

async function safePublish(deps: ProcessDeps, event: DiscoveryEvent): Promise<void> {
  if (!deps.publish) return;
  try {
    await deps.publish(event);
  } catch (error) {
    deps.log("warn", { executionId: event.executionId, err: error instanceof Error ? error.message : String(error) }, "discovery progress publish failed");
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function processDiscovery(
  deps: ProcessDeps,
  executionId: string,
  attempt: { number: number; max: number } = { number: 1, max: 1 },
): Promise<ProcessOutcome> {
  const params = await deps.fetchJobParams(executionId);
  if (!params) {
    // Not RUNNING (already resolved) or gone entirely — nothing to do.
    deps.log("info", { executionId }, "discovery job skipped (execution not RUNNING)");
    return "skipped";
  }

  await safePublish(deps, { stage: "QUEUED", executionId, at: nowIso() });

  const query: DiscoveryQuery = {
    location: params.location,
    category: params.category,
    radius: params.radius,
    minRating: params.minRating,
    minReviews: params.minReviews,
    leadLimit: params.leadLimit,
  };
  if (deps.publish) {
    query.onProgress = async (event) => {
      await safePublish(deps, { ...event, executionId, at: nowIso() });
    };
  }

  try {
    const businesses = await deps.source.search(query);
    deps.log("info", { executionId, found: businesses.length }, "discovery search completed");
    await safePublish(deps, { stage: "COMPLETED", executionId, found: businesses.length, at: nowIso() });
    await deps.reportResults(executionId, businesses);
    return "completed";
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown discovery error";
    const final = isPermanent(error) || attempt.number >= attempt.max;
    if (!final) {
      // Transient (timeout/overload) and attempts remain — rethrow so BullMQ
      // retries with backoff; the execution stays RUNNING, no failure reported.
      deps.log("warn", { executionId, reason, attempt: attempt.number }, "discovery attempt failed, will retry");
      throw error;
    }
    deps.log("error", { executionId, reason, attempt: attempt.number }, "discovery search failed");
    await safePublish(deps, { stage: "FAILED", executionId, message: reason, at: nowIso() });
    await deps.reportFailure(executionId, reason);
    return "failed";
  }
}

/** Fetches the search params for one execution, or null if it's not (or is no longer) RUNNING. */
export function jobParamsFetcher(apiUrl: string, secret: string, fetchImpl: typeof fetch = fetch) {
  const base = apiUrl.replace(/\/+$/, "");
  return async (executionId: string): Promise<JobParams | null> => {
    const response = await fetchImpl(`${base}/api/internal/pipeline/discovery-jobs/${executionId}`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404 || response.status === 409) return null;
    if (!response.ok) throw new Error(`Failed to fetch discovery job params (HTTP ${response.status})`);
    return (await response.json()) as JobParams;
  };
}

/** POSTs the discovery-results callback (success or failure), with a short retry — same shape as apps/recorder-worker's apiNotifier. */
export function resultsReporter(apiUrl: string, secret: string, fetchImpl: typeof fetch = fetch) {
  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/internal/pipeline/discovery-results`;
  const post = async (body: Record<string, unknown>): Promise<void> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) return;
        lastError = new Error(`API responded ${response.status}`);
        if (response.status < 500) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    // The API's own stale-run reaper reconciles an execution whose callback
    // was lost entirely.
    throw lastError instanceof Error ? lastError : new Error("Callback failed");
  };

  return {
    reportResults: (executionId: string, businesses: DiscoveredBusiness[]) => post({ executionId, businesses }),
    reportFailure: (executionId: string, error: string) => post({ executionId, error }),
  };
}
