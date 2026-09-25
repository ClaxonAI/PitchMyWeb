"use client";

import { useCallback, useState } from "react";
import { ApiError, whatsappApi, type WhatsAppAccount } from "@/lib/api-client";
import { useWhatsAppSession } from "./useWhatsAppSession";

// Everything a screen needs to link, unlink and watch the user's one
// WhatsApp account: the account row and its live session state. Shared by
// the WhatsApp page and the link step inside campaigns, so both behave
// identically.

export function useWhatsAppLink(initialAccount: WhatsAppAccount | null) {
  const [account, setAccount] = useState<WhatsAppAccount | null>(initialAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { state, applyAccount } = useWhatsAppSession(account?.id ?? null, account?.status, account?.phoneNumber, {
    logoutReason: account?.logoutReason,
  });

  /** Adopts an account loaded after mount (the campaign step fetches its own). */
  const adoptAccount = useCallback((loaded: WhatsAppAccount | null) => {
    setAccount(loaded);
    if (loaded) applyAccount(loaded, { seed: true });
  }, [applyAccount]);

  async function run(action: () => Promise<WhatsAppAccount>): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const updated = await action();
      setAccount(updated);
      applyAccount(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const connect = (): void =>
    void run(async () => {
      // The account row is created lazily: a user who never links one
      // should not accumulate an empty record just for visiting the page.
      const target = account ?? (await whatsappApi.createAccount());
      // Mount the event stream before the worker can emit its one QR frame.
      if (!account) setAccount(target);
      return whatsappApi.connect(target.id);
    });

  const requestPairingCode = (phoneNumber: string): void =>
    void run(async () => {
      const target = account ?? (await whatsappApi.createAccount());
      if (!account) setAccount(target);
      return whatsappApi.pairingCode(target.id, phoneNumber);
    });

  const disconnect = (): void =>
    void run(async () => {
      if (!account) throw new Error("No account");
      return whatsappApi.disconnect(account.id);
    });


  return {
    account,
    state,
    pending,
    error,
    /** Linked and able to send: RECONNECTING recovers on its own, and the API accepts it. */
    ready: state.status === "CONNECTED" || state.status === "RECONNECTING",
    connect,
    requestPairingCode,
    disconnect,
    adoptAccount,
  } as const;
}
