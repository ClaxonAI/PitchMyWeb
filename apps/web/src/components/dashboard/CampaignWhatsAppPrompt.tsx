"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ApiError, campaignsApi, whatsappApi, type WhatsAppAccount } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/dashboard-ui/card";
import { LinkPanel } from "./LinkPanel";
import { useWhatsAppSession } from "./useWhatsAppSession";

export function CampaignWhatsAppPrompt({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [account, setAccount] = useState<WhatsAppAccount | null>(null);
  const [pending, setPending] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldConnect, setShouldConnect] = useState(false);
  const [startingPitches, setStartingPitches] = useState(false);
  const connectStartedFor = useRef<string | null>(null);
  const accountCreationStarted = useRef(false);
  const pitchStartAttempted = useRef(false);
  const { state } = useWhatsAppSession(account?.id ?? null, account?.status, account?.phoneNumber);

  useEffect(() => {
    void whatsappApi
      .listAccounts()
      .then(({ items }) => {
        const existing = items[0] ?? null;
        setAccount(existing);
        setShouldConnect(existing?.status !== "CONNECTED");
      })
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not load WhatsApp status."))
      .finally(() => setPending(false));
  }, []);

  useEffect(() => {
    if (!shouldConnect) return;
    if (!account) {
      if (accountCreationStarted.current) return;
      accountCreationStarted.current = true;
      setStarting(true);
      void whatsappApi
        .createAccount()
        .then((created) => setAccount(created))
        .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not create a WhatsApp connection."))
        .finally(() => setStarting(false));
      return;
    }
    if (account.status === "CONNECTED" || connectStartedFor.current === account.id) return;
    connectStartedFor.current = account.id;
    setStarting(true);
    setError(null);
    void whatsappApi
      .connect(account.id)
      .then(setAccount)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not start WhatsApp linking."))
      .finally(() => setStarting(false));
  }, [account, shouldConnect]);

  useEffect(() => {
    if (state.status !== "CONNECTED" || pitchStartAttempted.current) return;
    pitchStartAttempted.current = true;
    setStartingPitches(true);
    setError(null);

    async function startPitches(): Promise<void> {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const overview = await campaignsApi.overview(campaignId);
        if (overview.campaign.status === "PROCESSING" || overview.campaign.status === "COMPLETED") {
          await campaignsApi.pitch(campaignId);
          router.refresh();
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
      router.refresh();
    }

    void startPitches()
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "WhatsApp is linked, but pitches could not be started."))
      .finally(() => setStartingPitches(false));
  }, [campaignId, router, state.status]);

  async function start(): Promise<void> {
    setError(null);
    setStarting(true);
    try {
      const target = account ?? (await whatsappApi.createAccount());
      setAccount(target);
      connectStartedFor.current = null;
      setShouldConnect(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not start WhatsApp linking.");
    } finally {
      setStarting(false);
    }
  }

  if (pending) {
    return <Card className="flex items-center gap-3 p-5 text-sm text-dash-muted-foreground"><RefreshCw className="size-4 animate-spin" /> Preparing your WhatsApp connection…</Card>;
  }

  if (state.status === "CONNECTED") {
    return startingPitches ? (
      <Card className="flex items-center gap-3 border-dash-primary/30 bg-dash-secondary/30 p-5 text-sm text-dash-foreground">
        <RefreshCw className="size-4 animate-spin text-dash-primary" />
        <span className="animate-pulse">WhatsApp linked. Starting your pitches…</span>
      </Card>
    ) : error ? (
      <p role="alert" className="text-sm text-dash-destructive">{error}</p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-dash-foreground">Link WhatsApp to start pitching</h2>
        <p className="mt-1 text-sm text-dash-muted-foreground">Your campaign is ready. Scan the QR code, then the pitch controls will continue from here.</p>
      </div>
      {account ? (
        <LinkPanel
          state={state}
          pending={starting}
          onConnect={() => void start()}
          onPairingCode={(phoneNumber) => {
            setStarting(true);
            void whatsappApi.pairingCode(account.id, phoneNumber).then(setAccount).catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not request a pairing code.")).finally(() => setStarting(false));
          }}
        />
      ) : (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-sm text-dash-muted-foreground">Start WhatsApp linking to reveal your QR code.</p>
          <Button onClick={() => void start()} disabled={starting}>{starting ? "Starting…" : "Show QR code"}</Button>
        </Card>
      )}
      {error && <p role="alert" className="text-sm text-dash-destructive">{error}</p>}
    </div>
  );
}