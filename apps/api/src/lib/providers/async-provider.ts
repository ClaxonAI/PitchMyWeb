import type { Campaign, CampaignExecution } from "@pitchmyweb/db";

// Shared shape for every provider that only *starts* discovery and reports
// results later via a separate callback, rather than returning businesses
// directly from a synchronous call (see LeadProvider in demo-provider.ts).
// OsmLeadProvider is the only implementation today; this used to also cover
// N8nLeadProvider before n8n was removed in favor of the OSM/Overpass source.

export type TriggerResult = { externalRunId: string | null };

export interface AsyncLeadProvider {
  readonly name: string;
  trigger(campaign: Campaign, execution: CampaignExecution): Promise<TriggerResult>;
}
