import type { RenderedEmail } from "../email.service";
import { escapeHtml, renderLayout } from "./layout";

// Sent once a Razorpay payment is confirmed server-side (checkout verify or
// the signed webhook; lib/checkout/order-receipt.ts). Two versions of the
// middle paragraph, because a purchase lands in one of two states:
//
//   claimed    the buyer was signed in; the credits are already on the account
//   unclaimed  a guest checkout; the credits are added when they sign in with
//              Google or GitHub using this address (checkout.service.ts's
//              claimPaidOrdersForUser matches paid orders on a verified email)
//
// A confirmation, not a tax invoice: Razorpay sends the payment receipt.

export type PaymentReceiptInput = {
  recipientEmail: string;
  /** Smallest currency unit, as stored on the order. */
  amountMinor: number;
  currency: string;
  planName: string;
  credits: number;
  orderId: string;
  paymentId: string | null;
  claimed: boolean;
  /** https origin of the web app, e.g. https://pitchmyweb.in */
  appUrl: string;
  /** Replies go here; mentioned in the footer when set. */
  replyTo: string | null;
};

export function formatAmount(amountMinor: number, currency: string): string {
  const whole = amountMinor % 100 === 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function renderPaymentReceipt(input: PaymentReceiptInput): RenderedEmail {
  const amount = formatAmount(input.amountMinor, input.currency);
  const creditsLabel = `${input.credits} pitch credit${input.credits === 1 ? "" : "s"}`;
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const cta = input.claimed
    ? { label: "Open your dashboard", url: `${appUrl}/dashboard` }
    : { label: "Sign in to collect your credits", url: `${appUrl}/login` };

  const subject = `Payment received: ${creditsLabel}`;
  const nextStep = input.claimed
    ? `The ${creditsLabel} are already in your PitchMyWeb account, ready for your next campaign.`
    : `To collect your ${creditsLabel}, sign in to PitchMyWeb with Google or GitHub using ${input.recipientEmail}. They are added to that account automatically.`;

  const rows: Array<[string, string]> = [
    ["Amount paid", amount],
    ["Plan", input.planName],
    ["Pitch credits", String(input.credits)],
    ["Order", input.orderId],
    ...(input.paymentId ? ([["Razorpay payment", input.paymentId]] as Array<[string, string]>) : []),
  ];
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#5b6178;font-size:14px">${escapeHtml(label)}</td><td align="right" style="padding:6px 0;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const help = input.replyTo ? "Questions about this payment? Reply to this email." : "Questions about this payment? Contact us through pitchmyweb.in/contact.";

  const html = renderLayout({
    preheader: `${amount} received for ${creditsLabel}.`,
    heading: "Thanks, your payment went through",
    bodyHtml: `<p style="margin:0 0 16px">We've received your payment for the PitchMyWeb ${escapeHtml(input.planName)} plan.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid #e6e8f0;border-bottom:1px solid #e6e8f0">${table}</table>
<p style="margin:0 0 16px">${escapeHtml(nextStep)}</p>`,
    cta,
    footerNoteHtml: `${escapeHtml(help)} Razorpay emails its own payment receipt separately.`,
  });

  const text = [
    "Thanks, your payment went through.",
    "",
    `We've received your payment for the PitchMyWeb ${input.planName} plan.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    nextStep,
    `${cta.label}: ${cta.url}`,
    "",
    `${help} Razorpay emails its own payment receipt separately.`,
    "",
    "PitchMyWeb, a product of Claxon AI · https://pitchmyweb.in",
  ].join("\n");

  return { subject, html, text };
}
