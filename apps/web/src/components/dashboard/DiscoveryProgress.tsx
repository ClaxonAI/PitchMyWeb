"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { campaignsApi, type CampaignOverview } from "@/lib/api-client";
import { useVisibleInterval } from "@/lib/use-visible-interval";
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
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!running || finished) return;

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

    return () => {
      source.close();
    };
  }, [campaignId, executionId, running, finished]);

  // The stream says how far the search got; this check is what notices it
  // has ended (the stream closes without saying so) and reloads the page
  // with the new leads.
  useVisibleInterval(
    () => {
      campaignsApi
        .overview(campaignId)
        .then((overview) => {
          const status = overview.execution?.status;
          if (status && status !== "RUNNING") {
            setFinished(true);
            router.refresh();
          }
        })
        .catch(() => undefined);
    },
    3000,
    running && !finished,
  );

  const text = lineFor(event, running);
  if (!text) return null;

  return <p className="mt-1 text-sm text-dash-muted-foreground">{text}</p>;
}
