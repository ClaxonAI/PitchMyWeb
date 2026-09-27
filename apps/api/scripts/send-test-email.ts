// Manual, real send through Resend with the environment's own configuration:
// the one check the unit tests (which never reach the network) cannot make.
// Sends a sample payment confirmation, marked [Test], to the address given.
//
//   npm run email:test -w apps/api -- you@example.com
//   npm run email:test -w apps/api -- you@example.com --dry-run
//
// On the production box, after `set -a; . /etc/pitchmyweb/env; set +a`, this
// proves the deployed key, sender and domain work together. Prints Resend's
// email id and the outcome; never the key.
//
// Resend's test inboxes need no real mailbox: delivered@resend.dev accepts,
// bounced@resend.dev bounces.

import { readEmailConfig } from "../src/lib/email/config";
import { sendEmail } from "../src/lib/email/email.service";
import { renderPaymentReceipt } from "../src/lib/email/templates/payment-receipt";

const args = process.argv.slice(2);
const to = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!to) {
  console.error("Usage: npm run email:test -w apps/api -- <recipient> [--dry-run]");
  process.exit(2);
}

const config = readEmailConfig();
if (!config.ok) {
  console.error(`Email is not usable here: ${config.reason}. Set RESEND_API_KEY and RESEND_FROM_EMAIL (see apps/api/.env.example).`);
  process.exit(1);
}

const content = renderPaymentReceipt({
  recipientEmail: to,
  amountMinor: 14900,
  currency: "INR",
  planName: "Auto",
  credits: 20,
  orderId: "test_order",
  paymentId: null,
  claimed: false,
  appUrl: process.env.APP_URL?.trim() || "https://pitchmyweb.in",
  replyTo: config.config.replyTo,
});
content.subject = `[Test] ${content.subject}`;

console.log(`from: ${config.config.from}`);
console.log(`reply-to: ${config.config.replyTo ?? "(none)"}`);
console.log(`to: ${to}`);
console.log(`subject: ${content.subject}`);
if (dryRun) {
  console.log("DRY RUN: nothing sent.");
  process.exit(0);
}

const result = await sendEmail({ to, category: "payment_receipt", content, idempotencyKey: `test-email/${Date.now()}`, referenceId: "manual-test" });
console.log(JSON.stringify(result));
process.exit(result.status === "sent" ? 0 : 1);
