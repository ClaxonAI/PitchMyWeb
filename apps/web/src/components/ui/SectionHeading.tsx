import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "light",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn(align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl", className)}>
      <p className={cn("eyebrow", dark ? "text-lilac" : "text-primary")}>{eyebrow}</p>
      <h2 className="display mt-4 text-[40px] leading-[1.02] text-balance sm:text-5xl lg:text-[56px]">{title}</h2>
      {body && (
        <p
          className={cn(
            "mt-5 text-base leading-relaxed sm:text-[17px]",
            align === "center" && "mx-auto",
            "max-w-xl",
            dark ? "text-white/60" : "text-ink/60",
          )}
        >
          {body}
        </p>
      )}
    </div>
  );
}
