import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-transparent bg-dash-primary text-dash-primary-foreground",
      secondary: "border-transparent bg-dash-secondary text-dash-secondary-foreground",
      outline: "border-dash-border text-dash-foreground",
      success: "border-transparent bg-dash-success/15 text-dash-success",
      destructive: "border-transparent bg-dash-destructive/15 text-dash-destructive",
      muted: "border-transparent bg-dash-muted text-dash-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
