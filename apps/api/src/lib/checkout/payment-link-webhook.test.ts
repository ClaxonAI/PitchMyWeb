import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyPaymentLinkWebhookSignature } from "./payment-link-webhook";

describe("payment-link webhook signature", () => {
  it("accepts the signature for the raw webhook body", () => {
    const body = JSON.stringify({ event: "payment_link.paid" });
    const signature = createHmac("sha256", "webhook_secret").update(body).digest("hex");
    expect(verifyPaymentLinkWebhookSignature(body, signature, "webhook_secret")).toBe(true);
  });

  it("rejects a changed body or wrong secret", () => {
    const body = JSON.stringify({ event: "payment_link.paid" });
    const signature = createHmac("sha256", "webhook_secret").update(body).digest("hex");
    expect(verifyPaymentLinkWebhookSignature(`${body} `, signature, "webhook_secret")).toBe(false);
    expect(verifyPaymentLinkWebhookSignature(body, signature, "wrong_secret")).toBe(false);
  });
});
