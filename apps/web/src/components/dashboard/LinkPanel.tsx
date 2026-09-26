"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Copy, Laptop, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { PairingGuide } from "./PairingGuide";
import type { SessionState } from "./useWhatsAppSession";

// The real linking panel. It keeps the visual language of the marketing
// mock (LinkedDevicesMock) on purpose — someone who saw the pricing page
// should recognize this screen — but every pixel of the code here comes from
// the worker: the QR is a PNG data URL rendered server-side, so the browser
// never touches a Baileys token.

type Tab = "qr" | "code";

const COUNTRY_CODES = [
  { code: "+91", label: "India +91" },
  { code: "+971", label: "UAE +971" },
  { code: "+1", label: "US/Canada +1" },
  { code: "+44", label: "UK +44" },
  { code: "+65", label: "Singapore +65" },
  { code: "+61", label: "Australia +61" },
  { code: "+94", label: "Sri Lanka +94" },
  { code: "+977", label: "Nepal +977" },
] as const;

/** Seconds left until `iso`, ticking once a second; null without a deadline. */
function useSecondsLeft(iso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
}

export function LinkPanel({
  state,
  pending,
  onConnect,
  onPairingCode,
}: {
  state: SessionState;
  pending: boolean;
  onConnect: () => void;
  onPairingCode: (phoneNumber: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("qr");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<string>("+91");
  const [requested, setRequested] = useState(false);
  const [copied, setCopied] = useState(false);
  const secondsLeft = useSecondsLeft(state.pairingCodeExpiresAt);
  const codeExpired = secondsLeft === 0;
  // Between "Get code" and the code arriving (a few seconds): show progress
  // instead of the form, so a second tap cannot start a second attempt.
  const waitingForCode = requested && !state.pairingCode && (pending || state.status === "CONNECTING");
  const fullNumber = phone.trim().startsWith("+") ? phone.trim() : `${country} ${phone.trim()}`;

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
          <div className="max-w-xl">
            <p className="text-sm font-semibold">Link with a code instead</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink/60">
              Useful when you are reading this on the same phone. Enter the WhatsApp number you want to send pitches from and tap Get
              code.
            </p>

            <p className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-[12.5px] leading-relaxed text-ink/80">
              <span className="font-semibold text-ink">No SMS or OTP is sent.</span> Your code appears right here, on this page. You type it
              into WhatsApp on your phone, as shown below.
            </p>

            {requested && state.status === "RECONNECTING" ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-whatsapp/30 bg-whatsapp/8 px-5 py-4 text-[13px] text-ink/80" role="status">
                <RefreshCw size={18} strokeWidth={1.5} className="animate-spin" />
                Code accepted. Finishing the link with WhatsApp…
              </div>
            ) : state.pairingCode && !codeExpired ? (
              <div className="mt-5 rounded-2xl border border-whatsapp/30 bg-whatsapp/8 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] tracking-wide text-ink/70 uppercase">Your code</p>
                  {secondsLeft !== null && (
                    <p className="font-mono text-[11px] text-ink/70" aria-live="off">
                      expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                    </p>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="font-mono text-[28px] font-semibold tracking-[0.25em] text-ink" data-testid="pairing-code">
                    {state.pairingCode.slice(0, 4)}-{state.pairingCode.slice(4)}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(state.pairingCode ?? "").then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1_500);
                      });
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="mt-2 text-[12px] leading-snug text-ink/70">
                  Sent for {fullNumber}. Type it in WhatsApp on that phone within the time shown.
                </p>
                <p className="mt-1.5 text-[12px] leading-snug text-ink/70" data-testid="pairing-help">
                  If WhatsApp says <span className="font-semibold">Couldn’t link device</span>, check that {fullNumber} is the WhatsApp number
                  on that phone, then get a new code. Still failing? Use the QR code instead.
                </p>
                <button
                  type="button"
                  className="mt-2 text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    setRequested(true);
                    onPairingCode(fullNumber);
                  }}
                >
                  Get a new code
                </button>
              </div>
            ) : waitingForCode ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-ink/8 bg-mist-2 px-5 py-4 text-[13px] text-ink/70" role="status">
                <RefreshCw size={18} strokeWidth={1.5} className="animate-spin" />
                Asking WhatsApp for your code. This takes a few seconds…
              </div>
            ) : (
              <form
                className="mt-5 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  setRequested(true);
                  onPairingCode(fullNumber);
                }}
              >
                <div className="flex h-11 flex-1 overflow-hidden rounded-2xl border border-ink/12 bg-white transition focus-within:border-primary/50">
                  <label className="sr-only" htmlFor="pairing-country">
                    Country code
                  </label>
                  <select
                    id="pairing-country"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    className="border-r border-ink/10 bg-transparent pr-1 pl-3 text-sm text-ink outline-none"
                  >
                    {COUNTRY_CODES.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="pairing-phone">
                    WhatsApp number
                  </label>
                  <input
                    id="pairing-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="94883 29318"
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none"
                  />
                </div>
                <Button type="submit" disabled={pending || phone.replace(/\D/g, "").length < 6} size="md">
                  {pending ? "Requesting…" : codeExpired ? "Get a new code" : "Get code"}
                </Button>
              </form>
            )}
            {codeExpired && state.pairingCode && (
              <p className="mt-2 text-[12px] text-ink/70">That code has expired. Get a new one to try again.</p>
            )}

            <div className="mt-6 border-t border-ink/6 pt-5">
              <p className="mb-3 text-[12px] font-semibold tracking-wide text-ink/70 uppercase">Where the code goes</p>
              <PairingGuide code={state.pairingCode && !codeExpired ? state.pairingCode : null} />
            </div>
          </div>
        )}

        <p className="mt-6 rounded-2xl border border-ink/8 bg-mist-2 px-4 py-3 text-[12px] leading-snug text-ink/60">
          For your privacy we sign this number out as soon as the campaign has finished sending. You link it again for the next one.
        </p>

        {state.error && (
          <p role="alert" className="mt-5 rounded-2xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
            {state.error}
          </p>
        )}
      </div>
    </div>
  );
}
