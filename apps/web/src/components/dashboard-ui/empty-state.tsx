import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The state most of this dashboard is in on day one: no campaigns, no leads,
 * no analytics. Showing a wall of zeros (or an axis with nothing plotted on
 * it) tells a new customer nothing and reads as broken, so every surface that
 * can be empty renders this instead — one icon, what the panel will hold, and
 * the single action that fills it.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-5 py-8" : "gap-3 px-6 py-12",
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-full bg-dash-secondary text-dash-primary"
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-dash-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-dash-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
