"use client";

import { useCallback, useEffect, useState } from "react";
import { Container } from "@/components/ui/Container";
import { whatsappApi, type WhatsAppAccount, type WhatsAppMessage } from "@/lib/api-client";
import { ConnectedCard } from "./ConnectedCard";
import { ConnectionStepper, stepForStatus } from "./ConnectionStepper";
import { LinkPanel } from "./LinkPanel";
import { MessagesTable } from "./MessagesTable";
import { TestMessageForm } from "./TestMessageForm";
import { useWhatsAppLink } from "./useWhatsAppLink";
import { logoutReasonText } from "./whatsapp-session-text";

// The dashboard page. Phase 2 supports one linked account per user, so the
// panel works with the first account and creates one on demand rather than
// asking the user to pick.

const MESSAGE_REFRESH_MS = 4_000;

export function WhatsAppPanel({ initialAccounts }: { initialAccounts: WhatsAppAccount[] }) {
  const link = useWhatsAppLink(initialAccounts[0] ?? null);
  const { account, state, pending, error } = link;
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const connected = state.status === "CONNECTED";

  const refreshMessages = useCallback(async (): Promise<void> => {
    if (!account) return;
    try {
      const result = await whatsappApi.listMessages(account.id);
      setMessages(result.items);
    } catch {
      // The table simply keeps its last known rows.
    }
  }, [account]);

  // Messages move through QUEUED -> SENDING -> SENT -> DELIVERED -> READ
  // without any client action, so the table polls. Receipts arrive on the
  // worker's own schedule, not in response to anything the browser did.
  useEffect(() => {
    if (!account || !connected) return;
    void refreshMessages();
    const timer = setInterval(() => void refreshMessages(), MESSAGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [account, connected, refreshMessages]);

  return (
    <Container className="py-10 sm:py-14">
      <header className="max-w-2xl">
        <p className="eyebrow text-primary">WhatsApp</p>
        <h1 className="display mt-3 text-[34px] leading-[1.05] sm:text-[44px]">Pitch from your own number</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink/60">
          Link WhatsApp for each campaign. Pitches send from your number, with an opt-out list and sending limits applied
          automatically, and PitchMyWeb unlinks itself when the campaign has finished.
        </p>
      </header>

      <div className="mt-8 rounded-card border border-ink/8 bg-mist-2 px-5 py-4 sm:px-6">
        <ConnectionStepper current={stepForStatus(state.status, account !== null)} />
      </div>

      {!connected && state.logoutReason && (
        <p role="status" className="mt-6 rounded-2xl border border-ink/10 bg-mist-2 px-4 py-3 text-[13px] text-ink/70">
          {logoutReasonText(state.logoutReason)}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-2xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {connected ? (
          <ConnectedCard state={state} pending={pending} onDisconnect={link.disconnect} />
        ) : (
          <LinkPanel
            state={state}
            pending={pending}
            onConnect={link.connect}
            onPairingCode={link.requestPairingCode}
          />
        )}

        {connected && account && <TestMessageForm accountId={account.id} onSent={() => void refreshMessages()} />}

        <MessagesTable messages={messages} />
      </div>
    </Container>
  );
}
