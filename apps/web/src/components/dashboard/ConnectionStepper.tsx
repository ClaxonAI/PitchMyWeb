import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WaStatus } from "@/lib/api-client";

// Four steps, derived from the session status rather than from local state,
// so a reconnect or a restart after a restore lands the user on the right
// step instead of on whatever they last clicked.

const STEPS = ["Connect account", "Scan or pair", "Verify", "Ready"] as const;

export function stepForStatus(status: WaStatus, hasAccount: boolean): number {
  if (!hasAccount) return 0;
  switch (status) {
    case "CONNECTED":
      return 3;
    case "QR_READY":
    case "PAIRING_CODE_READY":
      return 1;
    case "CONNECTING":
    case "RECONNECTING":
      return 2;
    default:
      return 0;
  }
}

export function ConnectionStepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2" aria-label="Linking progress">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2.5">
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10px] transition",
                done && "border-whatsapp bg-whatsapp text-white",
                active && !done && "border-primary bg-primary text-white",
                !done && !active && "border-ink/15 bg-white text-ink/40",
              )}
            >
              {done ? <Check size={12} strokeWidth={3} /> : index + 1}
            </span>
            <span className={cn("text-[13px] whitespace-nowrap", active || done ? "text-ink" : "text-ink/45")}>{label}</span>
            {index < STEPS.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-ink/10 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
