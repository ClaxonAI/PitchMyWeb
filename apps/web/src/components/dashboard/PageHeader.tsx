import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One header shape for every dashboard page, so the title, the one-line
 * explanation and the page's actions sit in the same place each time instead
 * of each page inventing its own arrangement.
 */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="display text-2xl text-dash-foreground">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1 text-sm text-dash-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
