"use client";

import { useState } from "react";
import { Check, Ticket, X } from "lucide-react";
import { checkoutApi, type AppliedCoupon } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Props = {
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon | null) => void;
};

export function CouponField({ applied, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-lime/35 px-3 py-2 text-[13px]">
        <span className="flex items-center gap-2 font-medium">
          <Check size={14} /> {applied.code} · {applied.discountPercent}% off
        </span>
        <button
          type="button"
          onClick={() => onApply(null)}
          aria-label="Remove coupon"
          className="rounded-md p-1 text-ink/60 hover:bg-white/60 hover:text-ink"
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
        className="flex min-h-11 items-center gap-1.5 text-[13px] text-ink/60 underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        <Ticket size={14} /> Have a coupon?
      </button>
    );
  }

  // Checked with the server, which charges by the same rule: a code shows a
  // discount here only if create-order will apply it.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = value.trim().toUpperCase();
    if (!code || checking) return;
    setChecking(true);
    try {
      onApply(await checkoutApi.coupon(code));
      setValue("");
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setChecking(false);
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
        <button type="submit" disabled={checking} className="h-10 rounded-xl bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink-2 disabled:opacity-60">
          {checking ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-[#c2412f]">That code isn&apos;t valid or has expired.</p>}
    </form>
  );
}
