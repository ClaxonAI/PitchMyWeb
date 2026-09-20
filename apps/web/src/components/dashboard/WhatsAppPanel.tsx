"use client";

import { useCallback, useEffect, useState } from "react";
import { Container } from "@/components/ui/Container";
import { ApiError, whatsappApi, type WhatsAppAccount, type WhatsAppMessage } from "@/lib/api-client";
import { ConnectedCard } from "./ConnectedCard";
import { ConnectionStepper, stepForStatus } from "./ConnectionStepper";
import { LinkPanel } from "./LinkPanel";
import { MessagesTable } from "./MessagesTable";
import { TestMessageForm } from "./TestMessageForm";
import { useWhatsAppSession } from "./useWhatsAppSession";

// The dashboard page. Phase 2 supports one linked account per user, so the
// panel works with the first account and creates one on demand rather than
// asking the user to pick.

const MESSAGE_REFRESH_MS = 4_000;

export function WhatsAppPanel({ initialAccounts }: { initialAccounts: WhatsAppAccount[] }) {
  const [account, setAccount] = useState<WhatsAppAccount | null>(initialAccounts[0] ?? null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { state } = useWhatsAppSession(account?.id ?? null, account?.status, account?.phoneNumber);
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

  async function run(action: () => Promise<WhatsAppAccount>): Promise<void> {
    setError(null);
    setPending(true);
    try {
      setAccount(await action());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const onConnect = (): void =>
    void run(async () => {
      // The account row is created lazily: a user who never links one
      // should not accumulate an empty record just for visiting the page.
      const target = account ?? (await whatsappApi.createAccount());
      // Mount the event stream before the worker can emit its one QR frame.
      if (!account) setAccount(target);
      return whatsappApi.connect(target.id);
    });

  const onPairingCode = (phoneNumber: string): void =>
    void run(async () => {
      const target = account ?? (await whatsappApi.createAccount());
      if (!account) setAccount(target);
      return whatsappApi.pairingCode(target.id, phoneNumber);
    });

  const onDisconnect = (): void =>
    void run(async () => {
      if (!account) throw new Error("No account");
      return whatsappApi.disconnect(account.id);
    });

  return (
    <Container className="py-10 sm:py-14">
      <header className="max-w-2xl">
        <p className="eyebrow text-primary">WhatsApp</p>
        <h1 className="display mt-3 text-[34px] leading-[1.05] sm:text-[44px]">Pitch from your own number</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink/60">
          Link WhatsApp once. Pitches then send from your number, with an opt-out list and sending limits applied
          automatically.
        </p>
      </header>

      <div className="mt-8 rounded-card border border-ink/8 bg-mist-2 px-5 py-4 sm:px-6">
        <ConnectionStepper current={stepForStatus(state.status, account !== null)} />
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-2xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {connected ? (
          <ConnectedCard state={state} pending={pending} onDisconnect={onDisconnect} />
        ) : (
          <LinkPanel state={state} pending={pending} onConnect={onConnect} onPairingCode={onPairingCode} />
        )}

        {connected && account && <TestMessageForm accountId={account.id} onSent={() => void refreshMessages()} />}

        <MessagesTable messages={messages} />
      </div>
    </Container>
  );
}
