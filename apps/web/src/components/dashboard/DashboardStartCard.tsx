"use client";

import Link from "next/link";
import { MessageCircle, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent } from "@/components/dashboard-ui/card";
import { cn } from "@/lib/utils";
import { useSession } from "./SessionProvider";

/** A ratio against a limit, so a meter rather than prose: the track is a
 *  lighter step of the same hue as the fill, and the count is always written
 *  out beside it so the bar is never the only way to read the number.
 *
 *  The denominator is every credit this account has ever held — spent, held
 *  by a batch in flight, and still free — because that is the only total the
 *  remaining balance is a fraction *of*. Reserved credits are named in the
 *  caption rather than folded into either end: they are not spent, and they
 *  are not available either, and a balance that looks lower than expected is
 *  nearly always a batch still working. */
function CreditMeter({ available, reserved, used }: { available: number; reserved: number; used: number }) {
  const total = available + reserved + used;
  const spent = total - available;
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  const low = available <= 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-dash-muted-foreground">Pitch credits</span>
        <span className="text-xs text-dash-muted-foreground">
          <span className={cn("font-semibold", low ? "text-dash-destructive" : "text-dash-foreground")}>{available}</span> of {total} left
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={spent}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${available} of ${total} pitch credits left`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-dash-secondary"
      >
        <div className={cn("h-full rounded-full transition-all", low ? "bg-dash-destructive" : "bg-dash-primary")} style={{ width: `${pct}%` }} />
      </div>
      {reserved > 0 && (
        <p className="text-xs text-dash-muted-foreground">
          {reserved} held by {reserved === 1 ? "a pitch" : "pitches"} still sending. {reserved === 1 ? "It comes" : "They come"} back if the send fails.
        </p>
      )}
    </div>
  );
}

export function DashboardStartCard() {
  const { canDiscover, hasPaidAccess, availableCredits, reservedCredits, usedCredits } = useSession();

  if (!canDiscover) {
    return (
      <Card className="border-dash-destructive/30">
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-dash-foreground">You&apos;re out of pitch credits</p>
            <p className="text-sm text-dash-muted-foreground">
              {hasPaidAccess
                ? "Buy another credit pack to keep searching and pitching."
                : "Buy a credit pack to search for more businesses without a website."}
            </p>
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
              Nothing is scraped until you start a search for businesses without a website. Finding leads is free — a credit is only spent when a
              pitch actually sends, and comes straight back if it doesn&apos;t.
            </p>
          </div>
        </div>

        <CreditMeter available={availableCredits} reserved={reservedCredits} used={usedCredits} />

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/campaigns/new">
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
          <Button asChild variant="ghost">
            <Link href="/pricing">{hasPaidAccess ? "Buy more credits" : "Upgrade"}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
