"use client";

import Link from "next/link";
import { MessageCircle, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent } from "@/components/dashboard-ui/card";
import { cn } from "@/lib/utils";
import { useSession } from "./SessionProvider";

/** A ratio against a limit, so a meter rather than prose: the track is a
 *  lighter step of the same hue as the fill, and the count is always written
 *  out beside it so the bar is never the only way to read the number. */
function PitchMeter({ remaining, allowance }: { remaining: number; allowance: number }) {
  const used = Math.max(0, allowance - remaining);
  const pct = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0;
  const low = remaining <= 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-dash-muted-foreground">Free pitches</span>
        <span className="text-xs text-dash-muted-foreground">
          <span className={cn("font-semibold", low ? "text-dash-destructive" : "text-dash-foreground")}>{remaining}</span> of {allowance} left
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={allowance}
        aria-label={`${remaining} of ${allowance} free pitches left`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-dash-secondary"
      >
        <div className={cn("h-full rounded-full transition-all", low ? "bg-dash-destructive" : "bg-dash-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DashboardStartCard() {
  const { canDiscover, hasPaidAccess, freePitchesRemaining, freePitchesAllowance } = useSession();
  const remaining = freePitchesRemaining ?? freePitchesAllowance;

  if (!canDiscover) {
    return (
      <Card className="border-dash-destructive/30">
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-dash-foreground">You&apos;ve used your {freePitchesAllowance} free pitches</p>
            <p className="text-sm text-dash-muted-foreground">Pay for a plan to search for more businesses without a website.</p>
          </div>
          <Button asChild className="self-start">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dash-primary/25 bg-dash-secondary/30">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-dash-primary text-dash-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-dash-foreground">Next step</p>
            <p className="text-sm text-dash-muted-foreground">
              {hasPaidAccess
                ? "Your plan is active. Nothing is scraped until you start a search for businesses without a website. When that run finishes, pitches go out automatically if WhatsApp is linked."
                : "Nothing is scraped until you start a search for businesses without a website. When that run finishes, pitches go out automatically if WhatsApp is linked."}
            </p>
          </div>
        </div>

        {!hasPaidAccess ? <PitchMeter remaining={remaining} allowance={freePitchesAllowance} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/discover">
              <Search />
              Find businesses
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/whatsapp">
              <MessageCircle />
              Link WhatsApp
            </Link>
          </Button>
          {!hasPaidAccess && (
            <Button asChild variant="ghost">
              <Link href="/pricing">Upgrade</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
