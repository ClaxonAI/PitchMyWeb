import type { Campaign, CampaignExecution } from "@pitchmyweb/db";
import { enqueueDiscovery } from "../pipeline/discovery-queue";
import type { AsyncLeadProvider, TriggerResult } from "./async-provider";

// Asynchronous lead provider consumed by apps/python-discovery (Serper Maps
// scrape + optional LangChain enrichment). Same queue contract as osm/serper:
// this side only enqueues `{ executionId }`; results arrive on
// POST /api/internal/pipeline/discovery-results.
export class PythonLeadProvider implements AsyncLeadProvider {
  readonly name = "python";

  async trigger(_campaign: Campaign, execution: CampaignExecution): Promise<TriggerResult> {
    await enqueueDiscovery({ executionId: execution.id });
    return { externalRunId: null };
  }
}
