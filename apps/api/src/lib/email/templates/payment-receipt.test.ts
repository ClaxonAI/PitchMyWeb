import { describe, expect, it } from "vitest";
import { formatAmount, renderPaymentReceipt, type PaymentReceiptInput } from "./payment-receipt";

const base: PaymentReceiptInput = {
  recipientEmail: "buyer@example.com",
  amountMinor: 14900,
  currency: "INR",
  planName: "Auto",
  credits: 20,
  orderId: "order_abc",
  paymentId: "pay_123",
  claimed: true,
  appUrl: "https://pitchmyweb.in/",
  replyTo: "support@claxonai.in",
};

describe("renderPaymentReceipt", () => {
  it("names the credits in the subject and lists the payment in both parts", () => {
    const email = renderPaymentReceipt(base);
    expect(email.subject).toBe("Payment received: 20 pitch credits");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("₹149");
      expect(part).toContain("Auto");
      expect(part).toContain("order_abc");
      expect(part).toContain("pay_123");
    }
  });

  it("points a signed-in buyer at the dashboard", () => {
    const email = renderPaymentReceipt(base);
    expect(email.html).toContain('href="https://pitchmyweb.in/dashboard"');
    expect(email.text).toContain("https://pitchmyweb.in/dashboard");
    expect(email.text).toContain("already in your PitchMyWeb account");
  });

  it("tells a guest buyer how the credits reach their account", () => {
    const email = renderPaymentReceipt({ ...base, claimed: false });
    expect(email.html).toContain('href="https://pitchmyweb.in/login"');
    expect(email.text).toContain("sign in to PitchMyWeb with Google or GitHub using buyer@example.com");
  });

  it("escapes every value it puts into HTML", () => {
    const email = renderPaymentReceipt({ ...base, planName: '<script>alert("x")</script>', claimed: false, recipientEmail: "a&b@example.com" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("a&amp;b@example.com");
  });

  it("offers replying for help only when there is a reply-to, and carries no unsubscribe link", () => {
    expect(renderPaymentReceipt(base).text).toContain("Reply to this email");
    const noReply = renderPaymentReceipt({ ...base, replyTo: null });
    expect(noReply.text).not.toContain("Reply to this email");
    expect(noReply.text).toContain("pitchmyweb.in/contact");
    expect(noReply.html.toLowerCase()).not.toContain("unsubscribe");
  });

  it("leaves out the payment line when there is no Razorpay payment id", () => {
    expect(renderPaymentReceipt({ ...base, paymentId: null }).text).not.toContain("Razorpay payment:");
  });

  it("singular for one credit", () => {
    expect(renderPaymentReceipt({ ...base, credits: 1 }).subject).toBe("Payment received: 1 pitch credit");
  });
});

describe("formatAmount", () => {
  it("drops the decimals only for a whole amount", () => {
    expect(formatAmount(14900, "INR")).toBe("₹149");
    expect(formatAmount(14950, "INR")).toBe("₹149.50");
    // Plans are priced in INR today; another currency still formats, in whatever symbol the locale gives it.
    expect(formatAmount(32900, "USD")).toMatch(/^(US)?\$329$/);
  });
});
