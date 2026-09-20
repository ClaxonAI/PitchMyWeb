"use client";

import { useState } from "react";
import { Check, Ticket, X } from "lucide-react";
import { demoCoupons } from "@/data/plans";
import { cn } from "@/lib/utils";

type Props = {
  applied: string | null;
  onApply: (code: string | null) => void;
};

export function CouponField({ applied, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-lime/35 px-3 py-2 text-[13px]">
        <span className="flex items-center gap-2 font-medium">
          <Check size={14} /> {applied} · {Math.round(demoCoupons[applied] * 100)}% off
        </span>
        <button
          type="button"
          onClick={() => onApply(null)}
          aria-label="Remove coupon"
          className="rounded-md p-1 text-ink/50 hover:bg-white/60 hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[13px] text-ink/50 underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        <Ticket size={14} /> Have a coupon?
      </button>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = value.trim().toUpperCase();
    if (code in demoCoupons) {
      onApply(code);
      setValue("");
      setOpen(false);
    } else {
      setError(true);
    }
  };

  return (
    <form onSubmit={submit} className="animate-pop">
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Coupon code"
          aria-label="Coupon code"
          aria-invalid={error}
          className={cn(
            "h-10 min-w-0 flex-1 rounded-xl border bg-white px-3 font-mono text-sm uppercase outline-none placeholder:normal-case focus:ring-4",
            error ? "border-coral focus:ring-coral/15" : "border-ink/10 focus:border-primary focus:ring-primary/10",
          )}
        />
        <button type="submit" className="h-10 rounded-xl bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink-2">
          Apply
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-[#c2412f]">That code isn&apos;t valid or has expired.</p>}
    </form>
  );
}
