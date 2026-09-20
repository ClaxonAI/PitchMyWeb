import type { Campaign, CampaignExecution } from "@pitchmyweb/db";
import { enqueueDiscovery } from "../pipeline/discovery-queue";
import type { AsyncLeadProvider, TriggerResult } from "./async-provider";

// Asynchronous lead provider backed by apps/discovery-worker running with
// DISCOVERY_SOURCE=serper (Google Maps via serper.dev, plus AI-generated
// insights) — the replacement for the old n8n "AI Lead Generation & Social
// Discovery" workflow. Identical shape to OsmLeadProvider: this side only
// enqueues the job and returns; results arrive later via POST
// /api/internal/pipeline/discovery-results, same as every other async
// provider. Which concrete search actually runs (Overpass vs Serper) is
// entirely the worker process's own DISCOVERY_SOURCE choice — this class
// just needs a distinct `name` so CampaignExecution.provider records which
// one was configured.
export class SerperLeadProvider implements AsyncLeadProvider {
  readonly name = "serper";

  async trigger(_campaign: Campaign, execution: CampaignExecution): Promise<TriggerResult> {
    await enqueueDiscovery({ executionId: execution.id });
    return { externalRunId: null };
  }
}
