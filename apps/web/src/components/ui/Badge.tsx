import { cn } from "@/lib/utils";

type Tone = "primary" | "lime" | "coral" | "neutral" | "dark";

const tones: Record<Tone, string> = {
  primary: "border-primary/25 bg-primary/8 text-primary",
  lime: "border-lime bg-lime/40 text-ink",
  coral: "border-coral/30 bg-coral/10 text-[#c2412f]",
  neutral: "border-ink/10 bg-white text-ink/60",
  dark: "border-white/10 bg-white/8 text-white/70",
};

export function Badge({
  children,
  tone = "primary",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 font-mono text-[11px] leading-none font-medium tracking-[.08em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
