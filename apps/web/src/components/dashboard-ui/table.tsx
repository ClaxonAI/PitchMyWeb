import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    // relative: absolutely positioned children (sr-only labels on icon buttons)
    // take their position from this scroller instead of the page. Without it a
    // label in a scrolled-off column escaped the scroll box and widened the
    // whole page on phones, which then zoomed out to fit it.
    <div className="relative w-full overflow-x-auto rounded-dash-lg border border-dash-border">
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

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
