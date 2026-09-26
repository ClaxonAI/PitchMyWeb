"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Country, Market, Plan } from "@/types";
import { formatPrice } from "@/lib/utils";
import { ApiError, checkoutApi } from "@/lib/api-client";
import { loadRazorpayCheckout } from "@/lib/checkout/razorpay-loader";
import { useBackToClose } from "@/lib/use-back-to-close";

export type CheckoutOrder = {
  plan: Plan;
  market: Market;
  country: Country;
  subtotal: number;
  discount: number;
  currency: "USD" | "INR";
  coupon: string | null;
};

// Where a buyer lands once the payment is verified. They have no account yet
// (checkout is deliberately anonymous — see apps/api's checkout.service.ts),
// so the order id rides along in the URL and register/login claim it onto
// whichever account is created or signed into next.
function successUrl(orderId: string, claimed: boolean | undefined): string {
  return claimed ? "/campaigns/new" : `/register?orderId=${encodeURIComponent(orderId)}`;
}

/**
 * Order summary, then Razorpay Standard Checkout in a modal over this page.
 *
 * The buyer never sees an amount this component chose: create-order recomputes
 * the price server-side from the plan, market and coupon *named* here, and
 * returns the Razorpay order to open. Payment is only real once
 * /api/checkout/verify recomputes the HMAC signature and says so, which is why
 * nothing here treats the checkout handler firing as proof of payment.
 *
 * Payment never starts a scrape — that only happens when the buyer later
 * submits Discover.
 */
export function CheckoutDialog({ order, onClose }: { order: CheckoutOrder | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // The phone's Back button closes the order summary instead of leaving /pricing.
  const dismiss = useBackToClose(order !== null, onClose);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set while this dialog steps aside for Razorpay, so that close is not
  // taken as the buyer closing the order.
  const handingOff = useRef(false);

  // A modal <dialog> sits in the browser's top layer and makes everything
  // else on the page inert, and Razorpay's checkout is an iframe appended to
  // <body>: left open, this dialog would cover it and swallow every click,
  // leaving the buyer staring at "Opening Razorpay…". So the dialog closes
  // while Razorpay is up and comes back when Razorpay hands control back.
  const stepAside = () => {
    const dialog = ref.current;
    if (!dialog?.open) return;
    handingOff.current = true;
    dialog.close();
  };
  const comeBack = () => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (order && !dialog.open) dialog.showModal();
    if (!order && dialog.open) dialog.close();
    if (order) {
      setError(null);
      setPending(false);
      setConfirming(false);
    }
  }, [order]);

  const confirm = async () => {
    if (!order) return;
    setError(null);
    setPending(true);

    try {
      const created = await checkoutApi.createOrder({
        planId: order.plan.id,
        market: order.market,
        countryCode: order.country.code,
        // Omitted entirely when there is no coupon: createOrderSchema marks
        // couponCode optional *and* strict, so an explicit null is a 400
        // rather than "no coupon".
        ...(order.coupon ? { couponCode: order.coupon } : {}),
      });

      // Local/dev gateway (PAYMENT_GATEWAY unset): the order comes back
      // already PAID with no card network involved, so there is no modal to
      // open and nothing to verify.
      if (created.dummy) {
        window.location.assign(successUrl(created.orderId, created.claimed));
        return;
      }

      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable");

      const checkout = new window.Razorpay({
        key: created.keyId,
        amount: created.amount,
        currency: created.currency,
        order_id: created.razorpayOrderId,
        name: "PitchMyWeb",
        description: `${order.plan.name} · ${order.plan.batchSize} ${order.plan.unitLabel}`,
        theme: { color: "#4f39f6" },
        handler: (response) => {
          // Razorpay has charged the card, but this callback is client-side
          // and therefore not trustworthy on its own: the server re-derives
          // the signature before any order becomes PAID.
          comeBack();
          setConfirming(true);
          void (async () => {
            try {
              const verified = await checkoutApi.verify({
                orderId: created.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              if (verified.status !== "PAID") {
                setError("We couldn't confirm that payment. Nothing has been charged twice — please contact support with your payment id.");
                setConfirming(false);
                setPending(false);
                return;
              }
              window.location.assign(successUrl(verified.orderId, verified.claimed));
            } catch (verifyError) {
              setError(
                verifyError instanceof ApiError
                  ? verifyError.message
                  : "Your payment went through but we couldn't confirm it. Please contact support before paying again.",
              );
              setConfirming(false);
              setPending(false);
            }
          })();
        },
        modal: {
          // Closing Razorpay's own modal is a cancellation, not a failure:
          // the local order stays PENDING and the buyer can simply pay again.
          ondismiss: () => {
            comeBack();
            setPending(false);
          },
        },
      });

      checkout.on("payment.failed", (response) => {
        setError(response.error?.description ?? "The payment failed. Please try again or use a different method.");
        setPending(false);
      });

      stepAside();
      checkout.open();
    } catch (createError) {
      setError(createError instanceof ApiError ? createError.message : "We couldn't start the payment. Please try again.");
      setPending(false);
    }
  };

  const total = order ? order.subtotal - order.discount : 0;

  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (handingOff.current) {
          handingOff.current = false;
          return;
        }
        dismiss();
      }}
      onClick={(e) => e.target === ref.current && dismiss()}
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
              onClick={dismiss}
              aria-label="Close"
              className="-mt-1 -mr-2 rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>

          <dl className="mt-7 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/60">Leads from</dt>
              <dd className="font-medium">
                {order.market === "india" ? "India" : order.country.name}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/60">Batch price</dt>
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
            Razorpay opens over this page to take the payment. After it clears, create your account so your plan can be activated.
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-coral/30 bg-coral/8 px-4 py-3 text-[13px] text-[#c2412f]">
              {error}
            </p>
          )}

          <Button onClick={confirm} disabled={pending} size="lg" className="mt-6 w-full">
            {pending ? <Lock size={15} /> : <Check size={15} />}
            {confirming ? "Confirming payment…" : pending ? "Opening Razorpay…" : "Pay with Razorpay"}
          </Button>
          <p className="mt-3 text-center text-[11px] text-ink/60">You will be charged {formatPrice({ amount: total, currency: order.currency })}</p>
        </div>
      )}
    </dialog>
  );
}
