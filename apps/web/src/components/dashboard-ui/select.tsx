import * as React from "react";
import { cn } from "@/lib/utils";

// A plain native <select>, styled to match the rest of dashboard-ui — not
// Radix's Select primitive. This app has no need for custom-rendered
// options (icons, multi-column layouts, etc.) yet; a native select is
// simpler, fully accessible for free, and works without JS on first paint.
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-dash-md border border-dash-input bg-dash-background px-3 py-1 text-sm text-dash-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-dash-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
