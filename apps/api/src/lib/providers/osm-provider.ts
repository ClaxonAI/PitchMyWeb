import type { Campaign, CampaignExecution } from "@pitchmyweb/db";
import { enqueueDiscovery } from "../pipeline/discovery-queue";
import type { AsyncLeadProvider, TriggerResult } from "./async-provider";

// Asynchronous lead provider backed by apps/discovery-worker (Phase 2B),
// which searches OpenStreetMap/Overpass for business listings. `.trigger()`
// only starts the search; results arrive later via POST
// /api/internal/pipeline/discovery-results (an internal, bearer-token-
// authenticated call — the worker and the API share the same trust
// boundary, so there's no separate request-signing scheme here).
//
// A synchronous variant isn't offered: real Overpass queries (plus the
// Nominatim geocode that precedes them) routinely take longer than a
// request should block on, and both public services have their own
// rate/latency characteristics outside this process's control.
export class OsmLeadProvider implements AsyncLeadProvider {
  readonly name = "osm";

  async trigger(_campaign: Campaign, execution: CampaignExecution): Promise<TriggerResult> {
    await enqueueDiscovery({ executionId: execution.id });
    // A BullMQ job has no separate "external run id" concept worth
    // surfacing — the job id is already deterministic
    // (`discover-${executionId}`) and internal to this process.
    return { externalRunId: null };
  }
}
