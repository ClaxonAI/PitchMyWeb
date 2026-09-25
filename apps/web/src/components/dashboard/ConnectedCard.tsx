"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SessionState } from "./useWhatsAppSession";

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
}: {
  state: SessionState;
  pending: boolean;
  onDisconnect: () => void;
}) {
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

      <p className="mt-4 border-t border-whatsapp/20 pt-4 text-[12px] leading-relaxed text-ink/60">
        PitchMyWeb unlinks itself automatically once your campaigns have finished sending, so nothing stays linked between
        campaigns — you&apos;ll scan a new code for the next one. Disconnecting now does the same straight away and cancels anything
        still queued. Your message history stays.
      </p>
    </div>
  );
}
