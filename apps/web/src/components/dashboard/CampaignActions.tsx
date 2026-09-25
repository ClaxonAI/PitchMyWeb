"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCcw } from "lucide-react";
import { ApiError, campaignsApi, type Campaign } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";

export function CampaignActions({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Shown immediately on click rather than after the refresh round-trip, so
  // the button never looks like it did nothing.
  const [paused, setPaused] = useState(campaign.sendingPaused);

  async function run(action: string, fn: () => Promise<unknown>, after?: () => void) {
    setPending(action);
    setError(null);
    try {
      await fn();
      after?.();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  const started = campaign.status === "RUNNING" || campaign.status === "PROCESSING" || campaign.status === "COMPLETED";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {campaign.status === "DRAFT" && (
          <Button variant="secondary" disabled={pending !== null} onClick={() => run("ready", () => campaignsApi.update(campaign.id, { status: "READY" }))}>
            <RefreshCcw className="h-4 w-4" /> {pending === "ready" ? "Marking ready…" : "Mark ready"}
          </Button>
        )}
        {campaign.status === "READY" && (
          <Button disabled={pending !== null} onClick={() => run("run", () => campaignsApi.run(campaign.id))}>
            <Play className="h-4 w-4" /> {pending === "run" ? "Starting…" : "Run campaign"}
          </Button>
        )}
        {started &&
          (paused ? (
            <Button disabled={pending !== null} onClick={() => run("resume", () => campaignsApi.resumeSending(campaign.id), () => setPaused(false))}>
              <Play className="h-4 w-4" /> {pending === "resume" ? "Resuming…" : "Resume sending"}
            </Button>
          ) : (
            <Button variant="outline" disabled={pending !== null} onClick={() => run("pause", () => campaignsApi.pauseSending(campaign.id), () => setPaused(true))}>
              <Pause className="h-4 w-4" /> {pending === "pause" ? "Pausing…" : "Pause sending"}
            </Button>
          ))}
      </div>
      {started && paused && (
        <p className="max-w-xs text-right text-xs text-dash-muted-foreground">
          Paused. Sites and videos keep getting made; nothing is sent until you resume. No credits are lost.
        </p>
      )}
      {error && <p className="text-xs text-dash-destructive">{error}</p>}
    </div>
  );
}
