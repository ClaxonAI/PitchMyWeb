"use client";

import Link from "next/link";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { useSession } from "./SessionProvider";

export function DashboardStartCard() {
  const { canDiscover, hasPaidAccess, freePitchesRemaining, freePitchesAllowance } = useSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next step</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canDiscover ? (
          <>
            <p className="text-sm text-dash-muted-foreground">
              {hasPaidAccess
                ? "Your plan is active. Nothing is scraped until you start a search for businesses without a website. When that run finishes, pitches go out automatically if WhatsApp is linked."
                : `You have ${freePitchesRemaining ?? freePitchesAllowance} of ${freePitchesAllowance} free pitches left. Nothing is scraped until you start a search for businesses without a website. When that run finishes, pitches go out automatically if WhatsApp is linked.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/discover">Find businesses</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/whatsapp">Link WhatsApp</Link>
              </Button>
              {!hasPaidAccess && (
                <Button asChild variant="outline">
                  <Link href="/pricing">Upgrade</Link>
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-dash-muted-foreground">
              You&apos;ve used your {freePitchesAllowance} free pitches. Pay for a plan to search for more businesses without a website.
            </p>
            <Button asChild>
              <Link href="/pricing">View pricing</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}