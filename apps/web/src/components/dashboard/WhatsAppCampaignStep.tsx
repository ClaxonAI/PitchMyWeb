"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { whatsappApi } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { LinkPanel } from "./LinkPanel";
import { useWhatsAppLink } from "./useWhatsAppLink";
import { logoutReasonText, SESSION_LIFETIME_TEXT } from "./whatsapp-session-text";

/**
 * The "link your WhatsApp" step in front of every campaign that sends from
 * the user's number. The number is signed out after each campaign, so every
 * campaign starts here: a user who is still linked (a campaign in flight)
 * sees a one-line "sending from +91…" confirmation, and everyone else links
 * right on this screen instead of being sent to another page.
 */
export function WhatsAppCampaignStep({ onReadyChange }: { onReadyChange?: (ready: boolean) => void }) {
  const link = useWhatsAppLink(null);
  const { state, ready, pending, error, adoptAccount } = link;
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    whatsappApi
      .listAccounts()
      .then((result) => {
        if (!cancelled) adoptAccount(result.items[0] ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adoptAccount]);

  useEffect(() => {
    if (loaded) onReadyChange?.(ready);
  }, [loaded, ready, onReadyChange]);

  if (!loaded) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-dash-muted-foreground">Checking your WhatsApp…</CardContent>
      </Card>
    );
  }

  if (ready) {
    return (
      <Card className="border-dash-primary/25">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-dash-primary" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-dash-foreground">
                  Sending from {state.phoneNumber ? `+${state.phoneNumber}` : "your linked WhatsApp"}
                </p>
                <p className="text-xs text-dash-muted-foreground">{SESSION_LIFETIME_TEXT}</p>
              </div>
            </div>
            <Link href="/whatsapp" className="text-xs text-dash-muted-foreground underline underline-offset-2">
              Manage
            </Link>
          </div>
          {error && <p className="text-sm text-dash-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4" />
          Link your WhatsApp to send this campaign
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-dash-muted-foreground">
          Pitches go out from your own number. Scan the code with WhatsApp on your phone — it takes a few seconds.
        </p>
        {state.logoutReason && <p className="rounded-dash-lg border border-dash-border bg-dash-secondary/40 p-3 text-sm text-dash-foreground">{logoutReasonText(state.logoutReason)}</p>}
        {error && <p className="text-sm text-dash-destructive">{error}</p>}
        <LinkPanel
          state={state}
          pending={pending}
          onConnect={link.connect}
          onPairingCode={link.requestPairingCode}
        />
      </CardContent>
    </Card>
  );
}
