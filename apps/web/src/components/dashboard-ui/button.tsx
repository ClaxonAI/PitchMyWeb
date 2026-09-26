import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-dash-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dash-ring focus-visible:ring-offset-2 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-dash-primary text-dash-primary-foreground hover:opacity-90",
        secondary: "bg-dash-secondary text-dash-secondary-foreground hover:opacity-80",
        outline: "border border-dash-border bg-transparent text-dash-foreground hover:bg-dash-accent",
        ghost: "text-dash-foreground hover:bg-dash-accent",
        destructive: "bg-dash-destructive text-dash-destructive-foreground hover:opacity-90",
        link: "text-dash-primary underline-offset-4 hover:underline",
      },
      size: {
        // max-md: touch screens get 44px targets; the compact sizes stay for mouse.
        default: "h-9 px-4 py-2 max-md:h-11",
        sm: "h-8 rounded-dash-sm px-3 text-xs max-md:h-11 max-md:min-w-11",
        lg: "h-10 rounded-dash-lg px-6 max-md:h-11",
        icon: "h-9 w-9 shrink-0 max-md:h-11 max-md:w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
});
Button.displayName = "Button";
