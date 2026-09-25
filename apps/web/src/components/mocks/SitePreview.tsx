import type { SampleSite } from "@/types";
import { cn } from "@/lib/utils";

/**
 * A miniature, fully CSS-rendered website. Used wherever we need to show
 * "the sample site we built" without shipping screenshots.
 */
export function SitePreview({
  site,
  compact = false,
  className,
}: {
  site: SampleSite;
  compact?: boolean;
  className?: string;
}) {
  const { bg, fg, accent, muted } = site.theme;
  const bar = (w: string, o = 0.18) => (
    <span className="block h-1.5 rounded-full" style={{ width: w, background: fg, opacity: o }} />
  );

  return (
    <div className={cn("overflow-hidden rounded-xl border border-black/8 bg-white", className)}>
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-black/6 bg-[#f7f7f8] px-3 py-2">
        <div className="flex gap-1">
          <span className="size-2 rounded-full bg-[#ff5f57]" />
          <span className="size-2 rounded-full bg-[#febc2e]" />
          <span className="size-2 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto truncate rounded-md bg-white px-3 py-0.5 font-mono text-[9px] text-black/60 ring-1 ring-black/5">
          {site.domain}
        </div>
      </div>

      {/* page */}
      <div style={{ background: bg, color: fg }} className={cn("relative", compact ? "p-3" : "p-5 sm:p-6")}>
        <div className="flex items-center justify-between">
          <span className={cn("display", compact ? "text-[11px]" : "text-sm")}>{site.name}</span>
          <div className="flex items-center gap-2">
            {!compact && (
              <>
                {bar("22px", 0.3)}
                {bar("22px", 0.3)}
              </>
            )}
            <span
              className={cn("rounded-full", compact ? "h-2.5 w-7" : "h-4 w-12")}
              style={{ background: accent }}
            />
          </div>
        </div>

        {site.layout === "centered" ? (
          <div className={cn("text-center", compact ? "py-4" : "py-9")}>
            <p className={cn("font-mono tracking-[.2em] uppercase opacity-50", compact ? "text-[6px]" : "text-[8px]")}>
              {site.category} · {site.city}
            </p>
            <p className={cn("display mx-auto mt-2 max-w-[16ch] leading-[1.02]", compact ? "text-base" : "text-[28px]")}>
              {site.tagline}
            </p>
            <span
              className={cn("mt-4 inline-block rounded-full font-medium", compact ? "px-2 py-0.5 text-[7px]" : "px-4 py-1.5 text-[10px]")}
              style={{ background: accent, color: bg }}
            >
              {site.cta}
            </span>
          </div>
        ) : (
          <div className={cn("grid items-center gap-4", compact ? "grid-cols-[1.2fr_1fr] py-3" : "grid-cols-[1.25fr_1fr] py-7")}>
            <div>
              <p className={cn("font-mono tracking-[.2em] uppercase opacity-50", compact ? "text-[6px]" : "text-[8px]")}>
                {site.category}
              </p>
              <p
                className={cn(
                  "display mt-1.5 leading-[1.02]",
                  compact ? "text-[15px]" : "text-[26px]",
                  site.layout === "editorial" && "italic",
                )}
              >
                {site.tagline}
              </p>
              <div className={cn("space-y-1.5", compact ? "mt-2" : "mt-3")}>
                {bar("90%", 0.14)}
                {!compact && bar("70%", 0.14)}
              </div>
              <span
                className={cn("mt-3 inline-block rounded-full font-medium", compact ? "px-2 py-0.5 text-[7px]" : "px-3.5 py-1.5 text-[10px]")}
                style={{ background: accent, color: bg }}
              >
                {site.cta}
              </span>
            </div>
            <div
              className={cn("relative overflow-hidden rounded-lg", compact ? "h-16" : "h-32")}
              style={{ background: muted }}
            >
              <span
                className="absolute -right-4 -bottom-6 size-20 rounded-full opacity-70"
                style={{ background: accent }}
              />
              <span className="absolute top-3 left-3 size-5 rounded-full opacity-40" style={{ background: fg }} />
            </div>
          </div>
        )}

        {!compact && (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-md" style={{ background: muted, opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
