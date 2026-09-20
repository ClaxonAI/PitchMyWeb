import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-dash-md border border-dash-input bg-dash-background px-3 py-1 text-sm text-dash-foreground outline-none transition-colors placeholder:text-dash-muted-foreground focus-visible:ring-2 focus-visible:ring-dash-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
