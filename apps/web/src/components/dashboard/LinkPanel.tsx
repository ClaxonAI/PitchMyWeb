"use client";

import { useState } from "react";
import Image from "next/image";
import { Laptop, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { SessionState } from "./useWhatsAppSession";
import { STAY_LINKED_LABEL, stayLinkedHint } from "./whatsapp-session-text";

// The real linking panel. It keeps the visual language of the marketing
// mock (LinkedDevicesMock) on purpose — someone who saw the pricing page
// should recognize this screen — but every pixel of the code here comes from
// the worker: the QR is a PNG data URL rendered server-side, so the browser
// never touches a Baileys token.

type Tab = "qr" | "code";

export function LinkPanel({
  state,
  pending,
  onConnect,
  onPairingCode,
  stayLinked,
  onStayLinkedChange,
}: {
  state: SessionState;
  pending: boolean;
  onConnect: () => void;
  onPairingCode: (phoneNumber: string) => void;
  /** "Keep me signed in for 3 days"; unticked signs the number out after the campaign. */
  stayLinked: boolean;
  onStayLinkedChange: (value: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("qr");
  const [phone, setPhone] = useState("");

  const linking = state.status === "CONNECTING" || state.status === "RECONNECTING";

  return (
    <div className="overflow-hidden rounded-card border border-ink/8 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/6 px-5 py-3.5">
        <p className="text-[13px] font-semibold">Link your WhatsApp</p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[9px] tracking-wide",
              state.status === "CONNECTED" ? "bg-whatsapp/15 text-[#0a7a3c]" : "bg-ink/5 text-ink/60",
            )}
          >
            {state.status.replace(/_/g, " ")}
          </span>
          {!state.live && (
            <span className="font-mono text-[9px] tracking-wide text-ink/60" title="Live updates unavailable; polling instead">
              POLLING
            </span>
          )}
        </div>
      </div>

      <div className="border-b border-ink/6 px-5 pt-4">
        <div role="tablist" aria-label="Linking method" className="flex gap-1">
          {(["qr", "code"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "rounded-t-xl border-b-2 px-3 pb-2.5 text-[13px] transition",
                tab === value ? "border-primary text-ink" : "border-transparent text-ink/60 hover:text-ink",
              )}
            >
              {value === "qr" ? "Scan a QR code" : "Use my phone number"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {tab === "qr" ? (
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="grid size-[232px] shrink-0 place-items-center rounded-2xl border border-ink/8 bg-white p-2">
              {state.qrDataUrl ? (
                <Image src={state.qrDataUrl} alt="WhatsApp linking QR code" width={216} height={216} unoptimized className="size-[216px]" />
              ) : linking ? (
                <div className="flex flex-col items-center gap-3 text-ink/60">
                  <RefreshCw size={28} strokeWidth={1.5} className="animate-spin" />
                  <p className="text-[11px]">Asking WhatsApp for a code…</p>
                </div>
              ) : (
                <div className="flex items-end gap-2 text-ink/60">
                  <Smartphone size={34} strokeWidth={1.25} />
                  <span className="mb-3 w-8 border-t-2 border-dashed border-ink/15" />
                  <Laptop size={44} strokeWidth={1.25} />
                </div>
              )}
            </div>

            <div className="max-w-sm">
              <p className="text-sm font-semibold">Scan with WhatsApp</p>
              <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-ink/60">
                <li>Open WhatsApp on your phone.</li>
                <li>
                  Go to <span className="text-ink">Settings → Linked devices</span>.
                </li>
                <li>
                  Tap <span className="text-ink">Link a device</span> and scan this code.
                </li>
              </ol>
              <Button onClick={onConnect} disabled={pending} size="sm" className="mt-5">
                {state.qrDataUrl ? "Get a new code" : pending ? "Starting…" : "Show QR code"}
              </Button>
              <p className="mt-3 text-[11px] leading-snug text-ink/60">
                A code expires after about a minute. Ask for a new one whenever you need it.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-md">
            <p className="text-sm font-semibold">Link with a code instead</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink/60">
              Useful when you are reading this on the same phone. Enter the number you want to send from, including its country
              code, and WhatsApp will show you where to type the code.
            </p>

            {state.pairingCode ? (
              <div className="mt-5 rounded-2xl border border-whatsapp/30 bg-whatsapp/8 px-5 py-4">
                <p className="text-[11px] tracking-wide text-ink/60 uppercase">Your pairing code</p>
                <p className="mt-1 font-mono text-2xl tracking-[0.3em] text-ink">{state.pairingCode}</p>
                <p className="mt-2 text-[12px] leading-snug text-ink/60">
                  On your phone: Settings → Linked devices → Link a device → Link with phone number instead.
                </p>
              </div>
            ) : (
              <form
                className="mt-5 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  onPairingCode(phone);
                }}
              >
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98000 00001"
                  className="h-11 flex-1 rounded-2xl border border-ink/12 bg-white px-4 text-sm outline-none transition focus:border-primary/50"
                />
                <Button type="submit" disabled={pending || phone.trim().length < 6} size="md">
                  {pending ? "Requesting…" : "Get code"}
                </Button>
              </form>
            )}
          </div>
        )}

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/8 bg-mist-2 px-4 py-3">
          <input
            type="checkbox"
            checked={stayLinked}
            onChange={(event) => onStayLinkedChange(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            <span className="block text-[13px] font-semibold text-ink">{STAY_LINKED_LABEL}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-ink/60">{stayLinkedHint(stayLinked)}</span>
          </span>
        </label>

        {state.error && (
          <p role="alert" className="mt-5 rounded-2xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
            {state.error}
          </p>
        )}
      </div>
    </div>
  );
}
