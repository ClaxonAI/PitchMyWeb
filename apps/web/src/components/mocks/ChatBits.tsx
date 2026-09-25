import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small building blocks for WhatsApp-style conversation mock-ups. */

export function ChatHeader({ name, status = "online" }: { name: string; status?: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-whatsapp-deep px-4 py-3 text-white">
      <span className="grid size-8 place-items-center rounded-full bg-white/20 text-xs font-semibold">
        {name.charAt(0)}
      </span>
      <div className="leading-tight">
        <p className="text-[13px] font-medium">{name}</p>
        <p className="text-[10px] text-white/80">{status}</p>
      </div>
    </div>
  );
}

export function Bubble({
  children,
  side,
  time,
  className,
}: {
  children: React.ReactNode;
  side: "out" | "in";
  time?: string;
  className?: string;
}) {
  const out = side === "out";
  return (
    <div className={cn("flex animate-pop", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]",
          out ? "rounded-tr-sm bg-[#d9fdd3]" : "rounded-tl-sm bg-white",
          className,
        )}
      >
        {children}
        {time && (
          <span className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-black/60">
            {time}
            {out && <CheckCheck size={12} className="text-[#53bdeb]" />}
          </span>
        )}
      </div>
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="flex animate-pop justify-start">
      <div className="flex gap-1 rounded-2xl rounded-tl-sm bg-white px-3.5 py-3 shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-black/35"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export const chatWallpaper = "bg-[#efeae2] bg-[radial-gradient(rgb(0_0_0/0.035)_1px,transparent_1px)] bg-[size:14px_14px]";
