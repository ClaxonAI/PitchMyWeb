"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// A left-side slide-in drawer built on Radix Dialog — used for the mobile
// sidebar. Not the full shadcn "sheet" (no top/right/bottom side variants);
// this app only ever needs the one.
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn("fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col overscroll-contain border-r border-dash-border bg-dash-card p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]", className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-dash-sm text-dash-muted-foreground transition-colors hover:text-dash-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
SheetContent.displayName = "SheetContent";

export function SheetTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-sm font-semibold", className)} {...props} />;
}
