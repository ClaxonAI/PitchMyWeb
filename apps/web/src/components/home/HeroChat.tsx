"use client";

import { useEffect, useState } from "react";
import { MapPin, Play, Star } from "lucide-react";
import { Bubble, ChatHeader, TypingDots, chatWallpaper } from "@/components/mocks/ChatBits";
import { SitePreview } from "@/components/mocks/SitePreview";
import { sampleSites } from "@/data/sampleSites";

const site = sampleSites[0];

// Each step reveals one more beat of the conversation, then the loop restarts.
const STEP_DURATIONS = [900, 1400, 1300, 1600, 4200];

export function HeroChat() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % STEP_DURATIONS.length), STEP_DURATIONS[step]);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      {/* The lead, as found on Maps */}
      <div className="absolute -top-6 -left-4 z-20 w-[210px] -rotate-3 rounded-2xl border border-ink/8 bg-white p-3.5 shadow-soft sm:-left-14">
        <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-wider text-ink/40 uppercase">
          <MapPin size={11} /> Lead found
        </div>
        <p className="mt-1.5 text-sm font-semibold">Morrow Coffee</p>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-ink/50">
          <Star size={11} className="fill-[#f5b400] text-[#f5b400]" /> 4.7 · 318 reviews
        </div>
        <span className="mt-2.5 inline-block rounded-md bg-coral/12 px-1.5 py-0.5 font-mono text-[9px] font-medium text-[#c2412f]">
          NO WEBSITE
        </span>
      </div>

      {/* Phone */}
      <div className="relative rounded-[44px] bg-ink p-2.5 shadow-lift">
        <div className="overflow-hidden rounded-[36px] bg-white">
          <div className="flex justify-center bg-whatsapp-deep pt-2">
            <span className="h-5 w-24 rounded-full bg-ink" />
          </div>
          <ChatHeader name="Morrow Coffee" status={step >= 3 && step < 4 ? "typing…" : "online"} />
          <div className={`flex h-[400px] flex-col justify-end gap-2 p-3 ${chatWallpaper}`}>
            {step >= 1 && (
              <Bubble side="out" className="p-1.5">
                <SitePreview site={site} compact />
                <p className="px-1.5 pt-2">Hi! I made a quick website for Morrow so you can see how it could look 👇</p>
              </Bubble>
            )}
            {step >= 2 && (
              <Bubble side="out" time="10:42" className="p-1.5">
                <div className="flex items-center gap-2.5 rounded-lg bg-black/5 p-2">
                  <span className="grid size-8 place-items-center rounded-full bg-whatsapp text-white">
                    <Play size={13} className="ml-0.5 fill-white" />
                  </span>
                  <div>
                    <p className="text-[12px] font-medium">morrow-demo.mp4</p>
                    <p className="text-[10px] text-black/45">0:30 · walkthrough</p>
                  </div>
                </div>
              </Bubble>
            )}
            {step === 3 && <TypingDots />}
            {step >= 4 && (
              <Bubble side="in" time="10:44">
                Wait, you built this for us? It looks great. How much for the full site?
              </Bubble>
            )}
          </div>
          <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5">
            <span className="flex-1 rounded-full bg-white px-3.5 py-2 text-[11px] text-black/35">Message</span>
            <span className="grid size-8 place-items-center rounded-full bg-whatsapp-deep" />
          </div>
        </div>
      </div>

      {/* Outcome */}
      <div
        className={`absolute -right-3 bottom-20 z-20 rounded-2xl bg-white p-3.5 shadow-soft ring-1 ring-ink/8 transition duration-500 sm:-right-12 ${
          step >= 4 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-whatsapp opacity-60" />
            <span className="relative size-2 rounded-full bg-whatsapp" />
          </span>
          New reply
        </p>
        <p className="mt-0.5 text-[11px] text-ink/50">Straight to your WhatsApp</p>
      </div>
    </div>
  );
}
