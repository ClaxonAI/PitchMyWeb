"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SessionState } from "./useWhatsAppSession";
import { isStayLinkedActive, sessionLifetimeText, STAY_LINKED_LABEL } from "./whatsapp-session-text";

function formatLastSeen(value: string | null): string {
  if (!value) return "just now";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(value).toLocaleDateString();
}

export function ConnectedCard({
  state,
  pending,
  onDisconnect,
  onStayLinkedChange,
}: {
  state: SessionState;
  pending: boolean;
  onDisconnect: () => void;
  onStayLinkedChange: (value: boolean) => void;
}) {
  const stayLinked = isStayLinkedActive(state.stayLinkedUntil);
  return (
    <div className="rounded-card border border-whatsapp/25 bg-whatsapp/6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <CheckCircle2 size={32} className="mt-0.5 shrink-0 text-whatsapp" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold">Connected</p>
            <p className="mt-1 font-mono text-[15px] text-ink">
              {state.phoneNumber ? `+${state.phoneNumber}` : "Number syncing…"}
            </p>
            <p className="mt-1.5 text-[12px] text-ink/60">Last active {formatLastSeen(state.lastSeenAt)}</p>
          </div>
        </div>

        <Button onClick={onDisconnect} disabled={pending} variant="outline" size="sm">
          {pending ? "Disconnecting…" : "Disconnect"}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-whatsapp/20 pt-4">
        <p className="text-[13px] text-ink">{sessionLifetimeText(state.stayLinkedUntil)}</p>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={stayLinked}
            disabled={pending}
            onChange={(event) => onStayLinkedChange(event.target.checked)}
            className="size-4 shrink-0 accent-primary"
          />
          {STAY_LINKED_LABEL}
        </label>
        <p className="text-[12px] leading-relaxed text-ink/60">
          Signing out — by you or automatically — unlinks this device in WhatsApp, deletes the stored credentials, and cancels anything still
          queued. Your message history stays.
        </p>
      </div>
    </div>
  );
}
