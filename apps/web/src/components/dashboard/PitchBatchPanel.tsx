"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send } from "lucide-react";
import { ApiError, campaignsApi, type PitchBatch } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { Input } from "@/components/dashboard-ui/input";
import { Label } from "@/components/dashboard-ui/label";
import { StatusBadge } from "./StatusBadge";
import { useSession } from "./SessionProvider";

const POLL_MS = 5000;

function plural(count: number, word: string): string {
  if (count === 1) return `${count} ${word}`;
  // "pitch" -> "pitches", not "pitchs". Only the sibilant endings this
  // component actually uses; it is not trying to be an inflection library.
  const suffix = /(ch|sh|s|x|z)$/.test(word) ? "es" : "s";
  return `${count} ${word}${suffix}`;
}

/**
 * One batch's progress, from the counters the API keeps on it. Says what was
 * asked for as well as what was reserved whenever the two differ: a user who
 * asks for 15 and gets 11 is owed that explanation, and only the 11 ever cost
 * them anything.
 */
function BatchProgress({ batch }: { batch: PitchBatch }) {
  const resolved = batch.sentCount + batch.failedCount;
  const pct = batch.reservedCount > 0 ? Math.min(100, (resolved / batch.reservedCount) * 100) : 100;
  return (
    <div className="flex flex-col gap-2 border-t border-dash-border p-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-dash-foreground">
          {resolved} of {plural(batch.reservedCount, "pitch")} finished
        </span>
        <StatusBadge status={batch.status} />
      </div>
      <div
        role="progressbar"
        aria-valuenow={resolved}
        aria-valuemin={0}
        aria-valuemax={batch.reservedCount}
        aria-label={`${resolved} of ${batch.reservedCount} pitches finished`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-dash-secondary"
      >
        <div className="h-full rounded-full bg-dash-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {/* Counts, not pluralised nouns: "sent" and "failed" describe the
          pitches, so they never take an -s. */}
      <p className="text-sm text-dash-muted-foreground">
        {batch.sentCount} sent · {batch.failedCount} failed · {batch.processingCount} still working
      </p>
      {batch.reservedCount < batch.requestedCount && (
        <p className="text-xs text-dash-muted-foreground">
          You asked for {batch.requestedCount}. Only {batch.reservedCount} could be pitched — the rest had no number WhatsApp can reach, or were already
          pitched. You were only charged for {batch.reservedCount}.
        </p>
      )}
      {batch.refundedCount > 0 && (
        <p className="text-xs text-dash-muted-foreground">
          {plural(batch.refundedCount, "credit")} came back from {batch.refundedCount === 1 ? "a pitch" : "pitches"} that couldn&apos;t be delivered.
        </p>
      )}
    </div>
  );
}

/**
 * "How many do you want to pitch?" — the step between seeing the leads a
 * search found and spending anything on them. The input is capped at whatever
 * is actually possible (eligible leads, credits in hand, campaign slots left),
 * because the API enforces exactly the same three limits and there is no
 * reason to let someone type a number that will be silently reduced.
 */
export function PitchBatchPanel({
  campaignId,
  eligibleCount,
  remainingSlots,
  initialBatches,
}: {
  campaignId: string;
  eligibleCount: number;
  remainingSlots: number;
  initialBatches: PitchBatch[];
}) {
  const router = useRouter();
  const { availableCredits } = useSession();
  const [batches, setBatches] = useState(initialBatches);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const max = Math.max(0, Math.min(eligibleCount, availableCredits, remainingSlots));
  const [count, setCount] = useState(max);
  const working = batches.some((batch) => batch.status === "PROCESSING");

  // Keep the field honest when the page refreshes with new numbers (a lead
  // resolved, credits moved) rather than leaving a stale count the API would
  // only reduce.
  useEffect(() => {
    setCount((current) => Math.min(Math.max(1, current), Math.max(1, max)));
  }, [max]);

  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => {
      campaignsApi
        .batches(campaignId)
        .then((result) => {
          setBatches(result.items);
          // Stage badges and credit balances live elsewhere on the page, so a
          // finished batch means the whole view is stale, not just this card.
          if (!result.items.some((batch) => batch.status === "PROCESSING")) router.refresh();
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [campaignId, working, router]);

  async function onPitch() {
    setSubmitting(true);
    setError(null);
    try {
      await campaignsApi.pitch(campaignId, count);
      const result = await campaignsApi.batches(campaignId).catch(() => null);
      if (result) setBatches(result.items);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pitch these leads</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-0">
        <div className="flex flex-col gap-3 p-4 pb-0">
          {max === 0 ? (
            <p className="text-sm text-dash-muted-foreground">
              {availableCredits === 0 ? (
                <>
                  You have no pitch credits left.{" "}
                  <Link href="/pricing" className="underline underline-offset-2">
                    Buy a credit pack
                  </Link>{" "}
                  to pitch more of these leads.
                </>
              ) : eligibleCount === 0 ? (
                "Every lead here has either been pitched already or has no number WhatsApp can reach."
              ) : (
                `This campaign has reached the ${remainingSlots === 0 ? "number of leads it was set up for" : "end of its slots"}.`
              )}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pitch-count">How many do you want to pitch?</Label>
                  <Input
                    id="pitch-count"
                    type="number"
                    min={1}
                    max={max}
                    value={count}
                    onChange={(event) => setCount(Math.max(1, Math.min(max, Number(event.target.value) || 1)))}
                    className="w-28"
                  />
                </div>
                <Button disabled={submitting} onClick={() => void onPitch()}>
                  <Send className="h-4 w-4" />
                  {submitting ? "Starting…" : `Pitch ${count}`}
                </Button>
              </div>
              <p className="text-xs text-dash-muted-foreground">
                {plural(eligibleCount, "lead")} can be pitched, and you have {plural(availableCredits, "credit")}. One credit per pitch, taken only when
                the message actually sends — a pitch that fails gives its credit back on its own.
              </p>
            </>
          )}
          {error && (
            <p className="text-sm text-dash-destructive">
              {error} {error.toLowerCase().includes("connect whatsapp") && <Link href="/whatsapp" className="underline underline-offset-2">Connect WhatsApp</Link>}
            </p>
          )}
        </div>

        {batches.length > 0 && (
          <div className="flex flex-col">
            {batches.map((batch) => (
              <BatchProgress key={batch.id} batch={batch} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
