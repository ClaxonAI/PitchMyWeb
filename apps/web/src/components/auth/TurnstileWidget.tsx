"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile for the password sign-up form; apps/api checks the
// token (lib/auth/turnstile.ts). Rendered "interaction-only": most visitors
// never see it, and it only draws a box when Cloudflare wants a click.
//
// Tokens are single-use and last five minutes. Turnstile refreshes an expired
// one on its own; after a submission the form bumps resetKey, because the API
// has spent the token whether the sign-up went through or not.

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptLoading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not start")));
    script.onerror = () => reject(new Error("Turnstile could not load"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptLoading = null; // let a later mount try again
    throw error;
  });
  return scriptLoading;
}

type Props = {
  siteKey: string;
  action: string;
  resetKey: number;
  onToken(token: string | null): void;
  onUnavailable(): void;
};

export function TurnstileWidget({ siteKey, action, resetKey, onToken, onUnavailable }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Latest callbacks without re-rendering the widget each time the form does.
  const callbacks = useRef({ onToken, onUnavailable });
  useEffect(() => {
    callbacks.current = { onToken, onUnavailable };
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          size: "flexible",
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            callbacks.current.onUnavailable();
          },
        });
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  return <div ref={container} />;
}
