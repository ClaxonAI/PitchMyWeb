import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * `stacked`: below the sm breakpoint each row becomes a card of "label  value"
 * lines instead of a sideways-scrolling table. Give every TableCell a `label`
 * (its column name) and mark the row's title cell `primary`.
 */
export function Table({ className, stacked, ...props }: React.HTMLAttributes<HTMLTableElement> & { stacked?: boolean }) {
  return (
    // relative: absolutely positioned children (sr-only labels on icon buttons)
    // take their position from this scroller instead of the page. Without it a
    // label in a scrolled-off column escaped the scroll box and widened the
    // whole page on phones, which then zoomed out to fit it.
    <div className={cn("relative w-full overflow-x-auto rounded-dash-lg border border-dash-border", stacked && "dash-table-stack")}>
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-dash-muted/60 [&_tr]:border-b [&_tr]:border-dash-border", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-dash-border transition-colors hover:bg-dash-accent/40", className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-10 px-4 text-left align-middle text-xs font-medium text-dash-muted-foreground", className)} {...props} />;
}

export function TableCell({ className, label, primary, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { label?: string; primary?: boolean }) {
  return <td data-label={label} data-primary={primary || undefined} className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
