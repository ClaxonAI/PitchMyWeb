"use client";

import { useEffect, useState } from "react";
import { Camera, ChevronRight, Laptop, MoreVertical, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Shows where a WhatsApp pairing code goes, on a drawn phone.
//
// People expect an OTP to arrive by SMS. It doesn't: the code appears on our
// page and is typed *into* WhatsApp. This walks through the four screens
// the user will actually see, playing on its own (and pausing for anyone
// who prefers reduced motion), with the real code in the last screen once
// there is one.

const STEPS = [
  { title: "Open WhatsApp", detail: "Tap ⋮ (Android) or Settings (iPhone), then Linked devices." },
  { title: "Link a device", detail: "Tap the green Link a device button." },
  { title: "Use your number", detail: "Under the camera, tap Link with phone number instead." },
  { title: "Type the code", detail: "Enter the 8-character code shown on this page." },
] as const;

const STEP_MS = 2_600;

export function PairingGuide({ code, className }: { code?: string | null; className?: string }) {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setAuto(false);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(timer);
  }, [auto]);

  const shown = (code ?? "K7Q2 9XWE").replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(8, " ").slice(0, 8);

  return (
    <div className={cn("flex flex-col items-center gap-5 sm:flex-row sm:items-start", className)}>
      {/* The phone */}
      <div
        aria-hidden
        className="relative h-[300px] w-[152px] shrink-0 rounded-[26px] border-[5px] border-[#1c1c28] bg-[#1c1c28] shadow-[0_18px_40px_-18px_rgba(20,20,40,0.45)]"
      >
        <div className="absolute top-1.5 left-1/2 z-10 h-1.5 w-12 -translate-x-1/2 rounded-full bg-[#1c1c28]" />
        <div className="h-full w-full overflow-hidden rounded-[21px] bg-white text-[#111b21]">
          <Screen step={step} code={shown} />
        </div>
      </div>

      {/* The steps */}
      <ol className="flex w-full max-w-xs flex-col gap-1.5" aria-label="Where to enter the code in WhatsApp">
        {STEPS.map((item, index) => (
          <li key={item.title}>
            <button
              type="button"
              onClick={() => {
                setStep(index);
                setAuto(false);
              }}
              aria-current={step === index ? "step" : undefined}
              className={cn(
                "flex w-full gap-3 rounded-xl px-3 py-2 text-left transition",
                step === index ? "bg-whatsapp/10" : "hover:bg-ink/4",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]",
                  step === index ? "bg-[#0a7a3c] text-white" : "bg-ink/8 text-ink/70",
                )}
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-ink">{item.title}</span>
                <span className="block text-[12px] leading-snug text-ink/70">{item.detail}</span>
              </span>
            </button>
          </li>
        ))}
        <li className="px-3 pt-1 text-[11px] leading-snug text-ink/60">
          WhatsApp may also pop up a notification saying “Enter code to link new device”. Tapping it opens the last screen directly.
        </li>
      </ol>
    </div>
  );
}

function Screen({ step, code }: { step: number; code: string }) {
  if (step === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between bg-[#008069] px-3 pt-5 pb-2 text-white">
          <span className="text-[11px] font-semibold">WhatsApp</span>
          <span className="flex items-center gap-2">
            <Search size={11} />
            <span className="rounded-full ring-2 ring-[#ffd54f] ring-offset-1 ring-offset-[#008069]">
              <MoreVertical size={11} />
            </span>
          </span>
        </div>
        <div className="relative flex-1 px-2 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <span className="size-5 rounded-full bg-[#dfe5e7]" />
              <span className="h-1.5 flex-1 rounded bg-[#e9edef]" />
            </div>
          ))}
          <div className="absolute top-1 right-2 w-[98px] rounded-md bg-white py-1 text-[8.5px] shadow-lg ring-1 ring-black/5">
            <p className="px-2 py-1 text-[#54656f]">New group</p>
            <p className="bg-[#fff8d6] px-2 py-1 font-semibold">Linked devices</p>
            <p className="px-2 py-1 text-[#54656f]">Settings</p>
          </div>
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="flex h-full flex-col">
        <div className="bg-[#008069] px-3 pt-5 pb-2 text-[11px] font-semibold text-white">Linked devices</div>
        <div className="flex flex-1 flex-col items-center gap-3 px-3 pt-5 text-center">
          <Laptop size={34} strokeWidth={1.25} className="text-[#008069]" />
          <p className="text-[8.5px] leading-snug text-[#54656f]">Use WhatsApp on other devices.</p>
          <span className="rounded-full bg-[#008069] px-3 py-1.5 text-[9px] font-semibold text-white ring-2 ring-[#ffd54f] ring-offset-2">
            Link a device
          </span>
        </div>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="flex h-full flex-col bg-[#111b21] text-white">
        <div className="px-3 pt-5 pb-2 text-[10px]">Scan QR code</div>
        <div className="mx-auto mt-3 grid size-[92px] place-items-center rounded-lg border-2 border-white/70">
          <Camera size={22} strokeWidth={1.25} className="text-white/60" />
        </div>
        <div className="mt-auto mb-5 px-2 text-center">
          <span className="inline-flex items-center gap-0.5 rounded-md bg-[#fff8d6] px-1.5 py-1 text-[8.5px] font-semibold text-[#0a7a3c]">
            Link with phone number instead <ChevronRight size={9} />
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="bg-[#008069] px-3 pt-5 pb-2 text-[11px] font-semibold text-white">Enter code</div>
      <div className="flex flex-1 flex-col items-center px-2 pt-5 text-center">
        <p className="text-[8.5px] leading-snug text-[#54656f]">Enter the code shown on the other device</p>
        <div className="mt-3 flex items-center gap-[3px]">
          {code.split("").map((char, i) => (
            <span key={i} className="flex items-center gap-[3px]">
              {i === 4 && <span className="w-1 text-[10px] text-[#54656f]">-</span>}
              <span className="grid h-5 w-[13px] place-items-center rounded-[3px] border border-[#008069]/40 bg-[#f0f7f4] font-mono text-[9.5px] font-semibold">
                {char.trim()}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-4 text-[8px] text-[#54656f]">Linking…</p>
      </div>
    </div>
  );
}
