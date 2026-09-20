"use client";

import { useState } from "react";
import { ArrowUpRight, SendHorizontal } from "lucide-react";
import { Bubble, ChatHeader, chatWallpaper } from "@/components/mocks/ChatBits";
import { cn } from "@/lib/utils";

const leads = [
  { name: "Morrow Coffee", phone: "919876543211", message: "Hi! I made a quick website for Morrow, have a look 👇" },
  { name: "Northstar Dental", phone: "971501234567", message: "Hello! I built a sample site for Northstar Dental 👇" },
  { name: "House of Nira", phone: "919812345670", message: "Hi! Here's a website I designed for House of Nira 👇" },
];

/** Simulates a Direct link pack: tap a wa.me link, the chat opens pre-filled. */
export function LinkPackMock({ batchSize }: { batchSize: number }) {
  const [active, setActive] = useState(0);
  const [sent, setSent] = useState<number[]>([]);
  const lead = leads[active];
  const isSent = sent.includes(active);

  return (
    <div className="grid h-[248px] grid-cols-[.9fr_1.1fr] overflow-hidden rounded-2xl border border-ink/8 bg-white">
      <div className="flex flex-col border-r border-ink/6">
        <p className="border-b border-ink/6 px-3 py-3 font-mono text-[9px] tracking-wider text-ink/40">
          YOUR LINKS · {sent.length}/{batchSize} SENT
        </p>
        <ul className="flex-1 space-y-1 p-1.5">
          {leads.map((l, i) => (
            <li key={l.phone}>
              <button
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "w-full rounded-lg px-2 py-2 text-left transition",
                  i === active ? "bg-mist" : "hover:bg-ink/[0.03]",
                )}
              >
                <span className="flex items-center justify-between gap-1 text-[12px] font-medium">
                  <span className="truncate">{l.name}</span>
                  {sent.includes(i) ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-whatsapp" />
                  ) : (
                    <ArrowUpRight size={12} className="shrink-0 text-ink/30" />
                  )}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[9px] text-primary/80">wa.me/{l.phone}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-3 pb-2.5 text-[10px] text-ink/35">+ {batchSize - leads.length} more</p>
      </div>

      <div className="flex min-w-0 flex-col">
        <ChatHeader name={lead.name} />
        <div className={cn("flex flex-1 flex-col justify-end p-2.5", chatWallpaper)}>
          {isSent && (
            <Bubble side="out" time="now" key={`sent-${active}`}>
              {lead.message}
            </Bubble>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-[#f0f2f5] p-2">
          <span className="min-w-0 flex-1 truncate rounded-full bg-white px-3 py-1.5 text-[10.5px] text-ink/70">
            {isSent ? <span className="text-ink/35">Message</span> : lead.message}
          </span>
          <button
            type="button"
            disabled={isSent}
            onClick={() => setSent((s) => [...s, active])}
            aria-label="Send pitch"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-whatsapp-deep text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <SendHorizontal size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
