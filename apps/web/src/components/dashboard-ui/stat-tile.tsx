import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A headline number. Deliberately not a one-bar chart and not the serif
 * display face: a standalone figure reads as data in the UI sans, and
 * proportional (not tabular) figures keep a number like 121 from looking
 * gappy at this size — tabular is for columns that must align, which these
 * tiles are not.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  emphasis = false,
  className,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-dash-lg border bg-dash-card p-4 transition-colors",
        emphasis ? "border-dash-primary/25 bg-dash-secondary/40" : "border-dash-border",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon ? (
          <Icon className={cn("size-4 shrink-0", emphasis ? "text-dash-primary" : "text-dash-muted-foreground")} />
        ) : null}
        <p className="truncate text-sm font-medium text-dash-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-dash-foreground">{value}</p>
      {hint ? <p className="text-xs text-dash-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** 1284 -> "1,284"; 12900 -> "12.9K". Keeps long numbers from wrapping a tile. */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 10_000) return value.toLocaleString("en-IN");
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
