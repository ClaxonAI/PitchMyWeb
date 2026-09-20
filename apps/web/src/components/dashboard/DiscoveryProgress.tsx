"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { campaignsApi, type CampaignOverview } from "@/lib/api-client";
import type { DiscoveryStage } from "@/lib/api-client";

type LiveEvent = {
  stage: DiscoveryStage;
  completed?: number;
  total?: number;
  found?: number;
  message?: string;
};

function lineFor(event: LiveEvent | null, running: boolean): string | null {
  if (!event) return running ? "Queued…" : null;
  switch (event.stage) {
    case "QUEUED":
      return "Queued…";
    case "GEOCODING":
      return "Looking up the area…";
    case "SEARCHING":
      return "Searching…";
    case "ENRICHING":
      return `Enriching ${event.completed ?? 0}/${event.total ?? 0}…`;
    case "COMPLETED":
      return `Done — ${event.found ?? 0} found`;
    case "FAILED":
      return event.message ? `Failed — ${event.message}` : "Failed";
  }
}

export function DiscoveryProgress({
  campaignId,
  executionId,
  initialStatus,
}: {
  campaignId: string;
  executionId: string;
  initialStatus: NonNullable<CampaignOverview["execution"]>["status"];
}) {
  const router = useRouter();
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const running = initialStatus === "RUNNING";

  useEffect(() => {
    if (!running) return;

    const source = new EventSource(`/api/campaigns/${campaignId}/executions/${executionId}/events`);
    const onMessage = (incoming: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(incoming.data) as LiveEvent;
        if (parsed?.stage) setEvent(parsed);
      } catch {
        // ignore keepalive/comments
      }
    };
    source.addEventListener("QUEUED", onMessage);
    source.addEventListener("GEOCODING", onMessage);
    source.addEventListener("SEARCHING", onMessage);
    source.addEventListener("ENRICHING", onMessage);
    source.addEventListener("COMPLETED", onMessage);
    source.addEventListener("FAILED", onMessage);

    const timer = window.setInterval(() => {
      campaignsApi.overview(campaignId).then((overview) => {
        const status = overview.execution?.status;
        if (status && status !== "RUNNING") {
          source.close();
          window.clearInterval(timer);
          router.refresh();
        }
      }).catch(() => undefined);
    }, 3000);

    return () => {
      source.close();
      window.clearInterval(timer);
    };
  }, [campaignId, executionId, running, router]);

  const text = lineFor(event, running);
  if (!text) return null;

  return <p className="mt-1 text-sm text-dash-muted-foreground">{text}</p>;
}
