"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { whatsappApi, type WaStatus } from "@/lib/api-client";

// Live session state for one account.
//
// EventSource is the primary channel; polling /status every few seconds is
// the fallback. Both are always safe to believe, because the worker writes
// the account row *before* it publishes an event — so the poll can only ever
// be behind the stream, never contradict it.
//
// Polling is not switched off when the stream opens. A stream can stall
// without erroring (a proxy holding the connection open while dropping
// data), and a stalled QR screen with no explanation is the worst outcome
// here; a slow poll costs one small request every few seconds and removes
// that failure mode entirely.

const POLL_INTERVAL_MS = 3_000;

export type SessionState = {
  status: WaStatus;
  qrDataUrl: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  lastSeenAt: string | null;
  error: string | null;
  /** Whether the event stream is currently connected. */
  live: boolean;
};

const INITIAL: SessionState = {
  status: "DISCONNECTED",
  qrDataUrl: null,
  pairingCode: null,
  phoneNumber: null,
  lastSeenAt: null,
  error: null,
  live: false,
};

type WaEvent =
  | { type: "STATUS"; status: WaStatus }
  | { type: "QR_READY"; qrDataUrl: string }
  | { type: "PAIRING_CODE"; code: string }
  | { type: "CONNECTED"; phoneNumber: string }
  | { type: "LOGGED_OUT" }
  | { type: "ERROR"; message: string };

export function useWhatsAppSession(accountId: string | null, initialStatus?: WaStatus, initialPhone?: string | null) {
  const [state, setState] = useState<SessionState>({
    ...INITIAL,
    status: initialStatus ?? INITIAL.status,
    phoneNumber: initialPhone ?? null,
  });
  // Kept in a ref so the polling effect does not have to re-subscribe every
  // time the status changes.
  const statusRef = useRef<WaStatus>(state.status);
  statusRef.current = state.status;

  const applyEvent = useCallback((event: WaEvent) => {
    setState((current) => {
      switch (event.type) {
        case "STATUS":
          return {
            ...current,
            status: event.status,
            // A QR belongs to one link attempt. Leaving a stale image on
            // screen after the status moved on would invite someone to
            // scan a code that can no longer work.
            qrDataUrl: event.status === "QR_READY" ? current.qrDataUrl : null,
            pairingCode: event.status === "PAIRING_CODE_READY" ? current.pairingCode : null,
            error: event.status === "ERROR" ? current.error : null,
          };
        case "QR_READY":
          return { ...current, status: "QR_READY", qrDataUrl: event.qrDataUrl, pairingCode: null, error: null };
        case "PAIRING_CODE":
          return { ...current, status: "PAIRING_CODE_READY", pairingCode: event.code, qrDataUrl: null, error: null };
        case "CONNECTED":
          return { ...current, status: "CONNECTED", phoneNumber: event.phoneNumber, qrDataUrl: null, pairingCode: null, error: null };
        case "LOGGED_OUT":
          return { ...current, status: "LOGGED_OUT", qrDataUrl: null, pairingCode: null };
        case "ERROR":
          return { ...current, status: "ERROR", error: event.message, qrDataUrl: null, pairingCode: null };
      }
    });
  }, []);

  // --- Event stream ---------------------------------------------------
  useEffect(() => {
    if (!accountId) return;
    const source = new EventSource(`/api/whatsapp/accounts/${accountId}/events`);

    const handle = (event: MessageEvent<string>): void => {
      try {
        applyEvent(JSON.parse(event.data) as WaEvent);
      } catch {
        // Malformed frame: ignore it and let the poll correct the view.
      }
    };

    for (const name of ["STATUS", "QR_READY", "PAIRING_CODE", "CONNECTED", "LOGGED_OUT", "ERROR"]) {
      source.addEventListener(name, handle as EventListener);
    }
    source.onopen = () => setState((current) => ({ ...current, live: true }));
    source.onerror = () => {
      // EventSource reconnects on its own; this only reflects that the
      // view is running on the polling fallback for the moment.
      setState((current) => ({ ...current, live: false }));
    };

    return () => {
      source.close();
    };
  }, [accountId, applyEvent]);

  // --- Polling fallback -----------------------------------------------
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const status = await whatsappApi.status(accountId);
        if (cancelled) return;
        setState((current) => ({
          ...current,
          // The QR and the pairing code only ever arrive over the stream
          // (they are never stored), so a poll must not clear them.
          status: status.status,
          phoneNumber: status.phoneNumber ?? current.phoneNumber,
          lastSeenAt: status.lastSeenAt ?? current.lastSeenAt,
          error: status.status === "ERROR" ? (status.lastError ?? current.error) : null,
        }));
      } catch {
        // Transient: the next tick tries again.
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [accountId]);

  const reset = useCallback(() => setState({ ...INITIAL }), []);

  return { state, reset } as const;
}
