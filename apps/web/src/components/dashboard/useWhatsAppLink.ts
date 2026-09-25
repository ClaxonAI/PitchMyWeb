"use client";

import { useCallback, useState } from "react";
import { ApiError, whatsappApi, type WhatsAppAccount } from "@/lib/api-client";
import { isStayLinkedActive } from "./whatsapp-session-text";
import { useWhatsAppSession } from "./useWhatsAppSession";

// Everything a screen needs to link, unlink and watch the user's one
// WhatsApp account: the account row, its live session state, and the
// "keep me signed in for 3 days" choice. Shared by the WhatsApp page and the
// link step inside campaigns, so both behave identically.

export function useWhatsAppLink(initialAccount: WhatsAppAccount | null) {
  const [account, setAccount] = useState<WhatsAppAccount | null>(initialAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Unticked by default: staying signed in is an opt-in. A number that is
  // already inside a 3-day window shows it ticked.
  const [stayLinked, setStayLinkedChoice] = useState(isStayLinkedActive(initialAccount?.stayLinkedUntil ?? null));

  const { state, applyAccount } = useWhatsAppSession(account?.id ?? null, account?.status, account?.phoneNumber, {
    stayLinkedUntil: account?.stayLinkedUntil,
    logoutReason: account?.logoutReason,
  });

  /** Adopts an account loaded after mount (the campaign step fetches its own). */
  const adoptAccount = useCallback((loaded: WhatsAppAccount | null) => {
    setAccount(loaded);
    if (loaded) {
      setStayLinkedChoice(isStayLinkedActive(loaded.stayLinkedUntil));
      applyAccount(loaded, { seed: true });
    }
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
      return whatsappApi.connect(target.id, { stayLinked });
    });

  const requestPairingCode = (phoneNumber: string): void =>
    void run(async () => {
      const target = account ?? (await whatsappApi.createAccount());
      if (!account) setAccount(target);
      return whatsappApi.pairingCode(target.id, phoneNumber, { stayLinked });
    });

  const disconnect = (): void =>
    void run(async () => {
      if (!account) throw new Error("No account");
      return whatsappApi.disconnect(account.id);
    });

  /**
   * The checkbox. Before a link attempt it only changes what the next
   * request sends; once a code is on screen or the number is linked, the
   * choice is saved straight away so it applies to the current login.
   */
  const changeStayLinked = (value: boolean): void => {
    setStayLinkedChoice(value);
    const current = account;
    const linkingOrLinked = state.status !== "DISCONNECTED" && state.status !== "LOGGED_OUT" && state.status !== "ERROR";
    if (current && linkingOrLinked) void run(() => whatsappApi.setStayLinked(current.id, value));
  };

  return {
    account,
    state,
    pending,
    error,
    stayLinked,
    /** Linked and able to send: RECONNECTING recovers on its own, and the API accepts it. */
    ready: state.status === "CONNECTED" || state.status === "RECONNECTING",
    connect,
    requestPairingCode,
    disconnect,
    changeStayLinked,
    adoptAccount,
  } as const;
}
