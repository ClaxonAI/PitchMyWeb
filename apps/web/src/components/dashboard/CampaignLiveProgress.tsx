"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CircleAlert, Clapperboard, Globe, Laptop, Pause, Send, Smartphone } from "lucide-react";
import { campaignsApi, type CampaignLeadRow, type PipelineStage } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;

type Row = CampaignLeadRow & { pipeline: NonNullable<CampaignLeadRow["pipeline"]> };

// The four things a pitch goes through, as the user thinks of them. Several
// pipeline stages collapse into one step: nobody needs to see SITE_PUBLISHED
// for the half-second before recording starts.
const STEPS = [
  { key: "site", label: "Website", icon: Globe },
  { key: "videos", label: "Videos", icon: Clapperboard },
  { key: "send", label: "Sending", icon: Send },
  { key: "done", label: "Delivered", icon: Check },
] as const;

const ACTIVE: PipelineStage[] = ["SELECTED", "BUILDING_SITE", "SITE_PUBLISHED", "RECORDING", "VIDEO_UPLOADED", "DELIVERY_QUEUED"];

function stepIndex(stage: PipelineStage): number {
  switch (stage) {
    case "SELECTED":
    case "BUILDING_SITE":
    case "SITE_PUBLISHED":
      return 0;
    case "RECORDING":
      return 1;
    case "VIDEO_UPLOADED":
    case "DELIVERY_QUEUED":
      return 2;
    case "SENT":
    case "LINK_READY":
      return 3;
    case "FAILED":
      return -1;
  }
}

function liveLine(row: Row, paused: boolean): string {
  switch (row.pipeline.stage) {
    case "SELECTED":
    case "BUILDING_SITE":
      return "Building the website…";
    case "SITE_PUBLISHED":
      return "Website is live";
    case "RECORDING":
      return "Recording on a phone and a laptop…";
    case "VIDEO_UPLOADED":
      return paused ? "Ready — waiting while sending is paused" : "Videos ready, handing to WhatsApp…";
    case "DELIVERY_QUEUED":
      return "Sending on WhatsApp…";
    case "SENT":
      return "Delivered on WhatsApp";
    case "LINK_READY":
      return "WhatsApp link ready to send";
    case "FAILED":
      return failureLine(row.pipeline);
  }
}

const REASONS: Record<string, string> = {
  invalid_number: "Not on WhatsApp",
  no_valid_phone: "No number WhatsApp can reach",
  opted_out: "Asked not to be contacted",
  recent_duplicate: "Messaged recently",
  claimed_elsewhere: "Taken by another user",
  whatsapp_not_connected: "Your WhatsApp was disconnected",
  not_delivered: "No delivery receipt",
  paused: "Stopped by an earlier pause",
  recording_failed: "Video recording failed",
  recording_timeout: "Video recording timed out",
};

function failureLine(pipeline: Row["pipeline"]): string {
  const reason = (pipeline.failureReason && REASONS[pipeline.failureReason]) ?? "Couldn't be sent";
  if (pipeline.creditOutcome === "REPLACED") return `${reason} — credit moved to another lead`;
  if (pipeline.creditOutcome === "REFUNDED") return `${reason} — credit refunded`;
  return `${reason} — retrying automatically`;
}

function Stepper({ row, paused }: { row: Row; paused: boolean }) {
  const current = stepIndex(row.pipeline.stage);
  const failed = current === -1;
  const done = current === 3;
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Pitch progress">
      {STEPS.map((step, index) => {
        const complete = done || (!failed && index < current);
        const active = !failed && !done && index === current;
        const waiting = active && paused && row.pipeline.stage === "VIDEO_UPLOADED";
        const Icon = step.icon;
        return (
          <li key={step.key} className="flex flex-col items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "relative grid size-8 place-items-center rounded-full border transition-colors duration-500",
                complete && "border-dash-success bg-dash-success text-dash-success-foreground",
                active && !waiting && "border-dash-primary bg-dash-primary/10 text-dash-primary",
                waiting && "border-dash-muted-foreground/40 bg-dash-muted text-dash-muted-foreground",
                !complete && !active && "border-dash-border bg-dash-card text-dash-muted-foreground/60",
                failed && "border-dash-border",
              )}
            >
              {active && !waiting && <span className="absolute inset-0 rounded-full bg-dash-primary/25 motion-safe:animate-ping" aria-hidden />}
              {waiting ? <Pause className="size-3.5" /> : <Icon className="size-3.5" />}
            </span>
            <span className={cn("text-[11px]", complete || active ? "text-dash-foreground" : "text-dash-muted-foreground")}>{step.label}</span>
            {/* The bar under a step fills as it completes and shimmers while it runs. */}
            <span className="relative h-1 w-full overflow-hidden rounded-full bg-dash-secondary">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                  complete ? "w-full bg-dash-success" : active ? "w-1/2 bg-dash-primary" : "w-0",
                  active && !waiting && "motion-safe:animate-[pmw-shimmer_1.4s_ease-in-out_infinite]",
                )}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PitchCard({ row, paused }: { row: Row; paused: boolean }) {
  const failed = row.pipeline.stage === "FAILED";
  const done = row.pipeline.stage === "SENT" || row.pipeline.stage === "LINK_READY";
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-dash-lg border bg-dash-card p-4 transition-colors duration-500 motion-safe:animate-[pmw-rise_0.4s_ease-out]",
        failed ? "border-dash-destructive/30" : done ? "border-dash-success/40" : "border-dash-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/leads/${row.id}`} className="min-w-0 font-medium text-dash-foreground hover:underline">
          <span className="block truncate">{row.business.name}</span>
        </Link>
        {row.business.city && <span className="shrink-0 text-xs text-dash-muted-foreground">{row.business.city}</span>}
      </div>
      <Stepper row={row} paused={paused} />
      <p className={cn("flex items-center gap-1.5 text-sm", failed ? "text-dash-destructive" : "text-dash-muted-foreground")} aria-live="polite">
        {failed && <CircleAlert className="size-4 shrink-0" />}
        {liveLine(row, paused)}
      </p>
      {row.pipeline.videoReady && (
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/pipelines/${row.pipeline.id}/video`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-dash-sm border border-dash-border px-2.5 py-1 text-xs text-dash-foreground hover:bg-dash-accent"
          >
            <Smartphone className="size-3.5" /> Phone video
          </a>
          {row.pipeline.laptopVideoReady && (
            <a
              href={`/api/pipelines/${row.pipeline.id}/video?view=laptop`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-dash-sm border border-dash-border px-2.5 py-1 text-xs text-dash-foreground hover:bg-dash-accent"
            >
              <Laptop className="size-3.5" /> Laptop video
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: "success" | "warn" | "muted" }) {
  return (
    <div className="flex flex-col rounded-dash-md border border-dash-border bg-dash-card px-3 py-2">
      <span
        key={value}
        className={cn(
          "text-xl font-semibold tabular-nums motion-safe:animate-[pmw-rise_0.35s_ease-out]",
          tone === "success" ? "text-dash-success" : tone === "warn" ? "text-dash-destructive" : "text-dash-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-xs text-dash-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Every pitch in the campaign, moving through website -> videos -> sending ->
 * delivered as it happens. Polls while anything is still in flight and stops
 * once everything has settled, then refreshes the page so the counts and
 * credits elsewhere catch up.
 */
export function CampaignLiveProgress({
  campaignId,
  initialRows,
  sendingPaused,
  discovering,
}: {
  campaignId: string;
  initialRows: CampaignLeadRow[];
  sendingPaused: boolean;
  discovering: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  const pitched = useMemo(() => rows.filter((row): row is Row => row.pipeline !== null), [rows]);
  const inFlight = pitched.some((row) => ACTIVE.includes(row.pipeline.stage) && !(sendingPaused && row.pipeline.stage === "VIDEO_UPLOADED"));
  const live = discovering || inFlight;

  useEffect(() => {
    if (!live) return;
    let settledOnce = false;
    const timer = window.setInterval(() => {
      campaignsApi
        .leads(campaignId)
        .then((result) => {
          setRows(result.items);
          const stillWorking = result.items.some((row) => row.pipeline && ACTIVE.includes(row.pipeline.stage));
          if (!stillWorking && !settledOnce) {
            settledOnce = true;
            router.refresh();
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [campaignId, live, router]);

  const count = (predicate: (row: Row) => boolean) => pitched.filter(predicate).length;
  const building = count((row) => stepIndex(row.pipeline.stage) === 0);
  const recording = count((row) => row.pipeline.stage === "RECORDING");
  const sending = count((row) => row.pipeline.stage === "DELIVERY_QUEUED" || (!sendingPaused && row.pipeline.stage === "VIDEO_UPLOADED"));
  const waiting = sendingPaused ? count((row) => row.pipeline.stage === "VIDEO_UPLOADED") : 0;
  const delivered = count((row) => row.pipeline.stage === "SENT" || row.pipeline.stage === "LINK_READY");
  const replaced = count((row) => row.pipeline.creditOutcome === "REPLACED");
  const refunded = count((row) => row.pipeline.creditOutcome === "REFUNDED");
  // Replaced pitches handed their slot to another lead, so they are not part of the total.
  const total = pitched.length - replaced;
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;

  if (pitched.length === 0) {
    if (!discovering) return null;
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <span className="relative grid size-9 place-items-center rounded-full bg-dash-primary/10 text-dash-primary">
            <span className="absolute inset-0 rounded-full bg-dash-primary/20 motion-safe:animate-ping" aria-hidden />
            <Globe className="size-4" />
          </span>
          <p className="text-sm text-dash-muted-foreground">Finding businesses without a website… Pitches start as soon as they come in.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {live && <span className="size-2 rounded-full bg-dash-success motion-safe:animate-pulse" aria-hidden />}
          Live pitches
        </CardTitle>
        <span className="text-sm text-dash-muted-foreground">
          {delivered} of {total} delivered{sendingPaused && " · sending paused"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="progressbar"
          aria-valuenow={delivered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${delivered} of ${total} pitches delivered`}
          className="h-2 w-full overflow-hidden rounded-full bg-dash-secondary"
        >
          <div className="h-full rounded-full bg-dash-success transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Counter label="Building sites" value={building} />
          <Counter label="Recording" value={recording} />
          <Counter label="Sending" value={sending} />
          <Counter label="Waiting (paused)" value={waiting} tone="muted" />
          <Counter label="Delivered" value={delivered} tone="success" />
          <Counter label="Replaced" value={replaced} tone="muted" />
          <Counter label="Refunded" value={refunded} tone={refunded > 0 ? "warn" : "muted"} />
        </div>

        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pitched.map((row) => (
            <PitchCard key={row.pipeline.id} row={row} paused={sendingPaused} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
