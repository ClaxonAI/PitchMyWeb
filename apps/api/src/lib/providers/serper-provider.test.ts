import { describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignExecution } from "@pitchmyweb/db";

const enqueueDiscovery = vi.fn(async (_job: { executionId: string }) => undefined);
vi.mock("../pipeline/discovery-queue", () => ({ enqueueDiscovery: (job: { executionId: string }) => enqueueDiscovery(job) }));

const { SerperLeadProvider } = await import("./serper-provider");

const campaign = { id: "ckcampaign000000000000000" } as unknown as Campaign;
const execution = { id: "ckexecution00000000000000" } as unknown as CampaignExecution;

describe("SerperLeadProvider.trigger", () => {
  it("enqueues a discovery job for the execution and returns immediately", async () => {
    enqueueDiscovery.mockClear();
    const provider = new SerperLeadProvider();
    const result = await provider.trigger(campaign, execution);

    expect(enqueueDiscovery).toHaveBeenCalledWith({ executionId: execution.id });
    expect(result).toEqual({ externalRunId: null });
  });

  it("is named 'serper' (getLeadProvider's LEAD_PROVIDER=serper branch, and CampaignExecution.provider, key off this)", () => {
    expect(new SerperLeadProvider().name).toBe("serper");
  });
});
