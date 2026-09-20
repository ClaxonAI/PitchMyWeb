"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Country, Market, Plan } from "@/types";
import { formatPrice } from "@/lib/utils";
import { paymentLinks } from "@/data/plans";

export type CheckoutOrder = {
  plan: Plan;
  market: Market;
  country: Country;
  subtotal: number;
  discount: number;
  currency: "USD" | "INR";
  coupon: string | null;
};

/**
 * Order summary shown before payment. Payment never starts a scrape — that
 * only happens when the buyer later submits Discover.
 */
export function CheckoutDialog({ order, onClose }: { order: CheckoutOrder | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (order && !dialog.open) dialog.showModal();
    if (!order && dialog.open) dialog.close();
    if (order) setError(null);
  }, [order]);

  const confirm = async () => {
    if (!order) return;
    setError(null);
    setPending(true);

    if (order.coupon) {
      setError("Coupons are not available for these fixed payment links. Remove the coupon to continue.");
      setPending(false);
      return;
    }

    window.location.assign(paymentLinks[order.plan.id][order.market]);
  };

  const total = order ? order.subtotal - order.discount : 0;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-panel bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm open:animate-pop"
    >
      {order && (
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-primary">Order summary</p>
              <h2 className="display mt-2 text-3xl">
                {order.plan.name} · {order.plan.batchSize} {order.plan.unitLabel}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-2 rounded-lg p-2 text-ink/40 hover:bg-ink/5 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>

          <dl className="mt-7 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/55">Leads from</dt>
              <dd className="font-medium">
                {order.market === "india" ? "India" : order.country.name}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/55">Batch price</dt>
              <dd className="font-mono">{formatPrice({ amount: order.subtotal, currency: order.currency })}</dd>
            </div>
            {order.coupon && (
              <div className="flex justify-between text-[#0a7a3c]">
                <dt>Coupon {order.coupon}</dt>
                <dd className="font-mono">−{formatPrice({ amount: order.discount, currency: order.currency })}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-ink/8 pt-4 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="font-mono font-semibold">{formatPrice({ amount: total, currency: order.currency })}</dd>
            </div>
          </dl>

          <p className="mt-6 rounded-xl bg-mist px-4 py-3 text-[13px] leading-relaxed text-ink/60">
            You&apos;ll be taken to Razorpay to complete payment. After paying, return here and create your account so your plan can be activated.
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
              {error}
            </p>
          )}

          <Button onClick={confirm} disabled={pending} size="lg" className="mt-6 w-full">
            {pending ? <Lock size={15} /> : <Check size={15} />}
            {pending ? "Opening Razorpay…" : "Pay with Razorpay"}
          </Button>
          <p className="mt-3 text-center text-[11px] text-ink/40">You will be charged {formatPrice({ amount: total, currency: order.currency })}</p>
        </div>
      )}
    </dialog>
  );
}
