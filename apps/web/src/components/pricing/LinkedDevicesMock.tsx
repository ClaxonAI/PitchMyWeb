"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Laptop, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "idle" | "qr" | "linking" | "linked";

// A deterministic fake QR pattern (21×21), so it renders identically on server and client.
const QR = Array.from({ length: 21 * 21 }, (_, i) => {
  const x = i % 21;
  const y = Math.floor(i / 21);
  const finder = (fx: number, fy: number) => {
    const dx = x - fx;
    const dy = y - fy;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx > 1 && dx < 5 && dy > 1 && dy < 5);
  };
  const f = finder(0, 0) ?? finder(14, 0) ?? finder(0, 14);
  if (f !== null) return f;
  return (x * 7 + y * 13 + x * y) % 5 < 2;
});

/** Simulates linking a WhatsApp account as a companion device. */
export function LinkedDevicesMock() {
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    if (stage !== "linking") return;
    const t = setTimeout(() => setStage("linked"), 1600);
    return () => clearTimeout(t);
  }, [stage]);

  return (
    <div className="flex h-[248px] flex-col overflow-hidden rounded-2xl border border-ink/8 bg-white">
      <div className="flex items-center justify-between border-b border-ink/6 px-4 py-3">
        <p className="text-[13px] font-semibold">Linked devices</p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[9px] tracking-wide",
            stage === "linked" ? "bg-whatsapp/15 text-[#0a7a3c]" : "bg-ink/5 text-ink/45",
          )}
        >
          {stage === "linked" ? "CONNECTED" : "NOT LINKED"}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        {stage === "idle" && (
          <div className="flex animate-pop flex-col items-center">
            <div className="flex items-end gap-2 text-ink/25">
              <Smartphone size={34} strokeWidth={1.25} />
              <span className="mb-3 w-8 border-t-2 border-dashed border-ink/15" />
              <Laptop size={44} strokeWidth={1.25} />
            </div>
            <button
              type="button"
              onClick={() => setStage("qr")}
              className="mt-5 rounded-full bg-whatsapp px-6 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgb(37_211_102/0.35)] transition hover:brightness-95"
            >
              Link a device
            </button>
          </div>
        )}

        {(stage === "qr" || stage === "linking") && (
          <div className="flex animate-pop items-center gap-5">
            <button
              type="button"
              onClick={() => setStage("linking")}
              aria-label="Simulate scanning the QR code"
              className="relative overflow-hidden rounded-xl border border-ink/8 bg-white p-2"
            >
              <div className="grid grid-cols-[repeat(21,5px)] gap-0">
                {QR.map((on, i) => (
                  <span key={i} className={cn("size-[5px]", on ? "bg-ink" : "bg-transparent")} />
                ))}
              </div>
              {stage === "linking" && (
                <span className="absolute inset-x-1 top-1 h-0.5 animate-scan rounded-full bg-whatsapp shadow-[0_0_12px_#25d366]" />
              )}
            </button>
            <div className="max-w-[150px]">
              <p className="text-[13px] font-semibold">{stage === "linking" ? "Linking…" : "Scan with WhatsApp"}</p>
              <p className="mt-1 text-[11px] leading-snug text-ink/50">
                Settings → Linked devices → Link a device. <span className="text-ink/35">(Tap the code to try it.)</span>
              </p>
              <button
                type="button"
                onClick={() => setStage("idle")}
                className="mt-2 text-[11px] text-ink/40 underline underline-offset-2 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage === "linked" && (
          <div className="flex animate-pop flex-col items-center text-center">
            <CheckCircle2 size={36} className="text-whatsapp" strokeWidth={1.75} />
            <p className="mt-3 text-sm font-semibold">You&apos;re connected</p>
            <p className="mt-1 text-xs text-ink/50">20 pitches will send from this number.</p>
            <button
              type="button"
              onClick={() => setStage("idle")}
              className="mt-3 text-[11px] text-ink/40 underline underline-offset-2 hover:text-ink"
            >
              Reset preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
