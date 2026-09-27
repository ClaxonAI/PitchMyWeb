import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../db/client";
import type { EmailConfigResult } from "../email/config";
import { resetEmailReportingForTesting } from "../email/email.service";
import type { EmailTransport, TransportResult } from "../email/transport";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { sendOrderReceipt, type OrderReceiptDeps } from "./order-receipt";

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

beforeEach(() => resetEmailReportingForTesting());

const config: EmailConfigResult = { ok: true, config: { apiKey: "test-resend-key-not-real", from: "PitchMyWeb <no-reply@pitchmyweb.in>", replyTo: "support@claxonai.in" } };

function deps(...results: TransportResult[]): OrderReceiptDeps & { transport: ReturnType<typeof vi.fn<EmailTransport>> } {
  const transport = vi.fn<EmailTransport>(async () => results.shift() ?? { id: `email_${Math.random().toString(36).slice(2)}` });
  return { config, transport, sleep: async () => {}, env: { APP_URL: "https://pitchmyweb.in" } };
}

async function order(data: { status?: "PENDING" | "PAID"; userId?: string | null; buyerId?: string | null; payerEmail?: string | null; dummy?: boolean } = {}) {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const created = await prisma.order.create({
    data: {
      planId: "auto",
      market: "india",
      amount: 14900,
      currency: "INR",
      credits: 20,
      status: data.status ?? "PAID",
      razorpayOrderId: data.dummy ? `dummy_${suffix}` : `order_${suffix}`,
      razorpayPaymentId: `pay_${suffix}`,
      userId: data.userId ?? null,
      buyerId: data.buyerId ?? null,
      payerEmail: data.payerEmail ?? null,
    },
  });
  createdOrderIds.push(created.id);
  return created;
}

async function user(prefix: string) {
  const created = await createTestUser(prefix);
  createdUserIds.push(created.id);
  return created;
}

describe("sendOrderReceipt", () => {
  it("emails the account owner once, keyed on the order, and records Resend's id", async () => {
    const owner = await user("receipt-owner");
    const paid = await order({ userId: owner.id, payerEmail: "someone-else@example.test" });
    const d = deps({ id: "email_owner" });

    expect(await sendOrderReceipt(prisma, { id: paid.id }, d)).toBe("sent");
    expect(await sendOrderReceipt(prisma, { id: paid.id }, d)).toBe("already_sent");
    expect(await sendOrderReceipt(prisma, { razorpayOrderId: paid.razorpayOrderId }, d)).toBe("already_sent");

    expect(d.transport).toHaveBeenCalledOnce();
    const [email, options] = d.transport.mock.calls[0]!;
    expect(email.to).toBe(owner.email);
    expect(email.from).toBe("PitchMyWeb <no-reply@pitchmyweb.in>");
    expect(email.replyTo).toBe("support@claxonai.in");
    expect(email.text).toContain("https://pitchmyweb.in/dashboard");
    expect(options.idempotencyKey).toBe(`order-receipt/${paid.id}`);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: paid.id } })).toMatchObject({ receiptEmailId: "email_owner" });
  });

  it("emails a signed-in buyer whose order is not claimed yet", async () => {
    const buyer = await user("receipt-buyer");
    const paid = await order({ buyerId: buyer.id });
    const d = deps();
    expect(await sendOrderReceipt(prisma, { id: paid.id }, d)).toBe("sent");
    expect(d.transport.mock.calls[0]![0].to).toBe(buyer.email);
  });

  it("emails a guest at the address they gave Razorpay, with how to collect the credits", async () => {
    const paid = await order({ payerEmail: "guest@example.test" });
    const d = deps();
    expect(await sendOrderReceipt(prisma, { razorpayOrderId: paid.razorpayOrderId }, d)).toBe("sent");
    const [email] = d.transport.mock.calls[0]!;
    expect(email.to).toBe("guest@example.test");
    expect(email.text).toContain("sign in to PitchMyWeb with Google or GitHub using guest@example.test");
    expect(email.text).toContain("https://pitchmyweb.in/login");
  });

  it("waits, without claiming, while no recipient is known", async () => {
    const paid = await order();
    const d = deps();
    expect(await sendOrderReceipt(prisma, { id: paid.id }, d)).toBe("no_recipient");
    expect(d.transport).not.toHaveBeenCalled();
    // The webhook then brings the payer's email, and it goes out.
    await prisma.order.update({ where: { id: paid.id }, data: { payerEmail: "late@example.test" } });
    expect(await sendOrderReceipt(prisma, { id: paid.id }, d)).toBe("sent");
  });

  it("sends nothing for an unpaid, unknown or dummy order", async () => {
    const d = deps();
    expect(await sendOrderReceipt(prisma, { id: (await order({ status: "PENDING", payerEmail: "p@example.test" })).id }, d)).toBe("not_paid");
    expect(await sendOrderReceipt(prisma, { id: "order_that_does_not_exist" }, d)).toBe("not_found");
    expect(await sendOrderReceipt(prisma, { id: (await order({ dummy: true, payerEmail: "d@example.test" })).id }, d)).toBe("dummy_order");
    expect(d.transport).not.toHaveBeenCalled();
  });

  it("releases the claim when the send fails, so the next confirmation retries it", async () => {
    const paid = await order({ payerEmail: "retry@example.test" });
    const failing = deps({ error: { name: "validation_error", statusCode: 422 } });
    expect(await sendOrderReceipt(prisma, { id: paid.id }, failing)).toBe("failed");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: paid.id } })).toMatchObject({ receiptEmailSentAt: null, receiptEmailId: null });

    const working = deps({ id: "email_retry" });
    expect(await sendOrderReceipt(prisma, { id: paid.id }, working)).toBe("sent");
    expect(working.transport.mock.calls[0]![1].idempotencyKey).toBe(`order-receipt/${paid.id}`);
  });

  it("sends once when the browser's verify and the webhook confirm at the same moment", async () => {
    const paid = await order({ payerEmail: "race@example.test" });
    const d = deps();
    const outcomes = await Promise.all([
      sendOrderReceipt(prisma, { id: paid.id }, d),
      sendOrderReceipt(prisma, { razorpayOrderId: paid.razorpayOrderId }, d),
      sendOrderReceipt(prisma, { id: paid.id }, d),
    ]);
    expect(outcomes.filter((outcome) => outcome === "sent")).toHaveLength(1);
    expect(d.transport).toHaveBeenCalledOnce();
  });

  it("does nothing, and touches no order, when email is not configured", async () => {
    const paid = await order({ payerEmail: "off@example.test" });
    const transport = vi.fn<EmailTransport>();
    expect(await sendOrderReceipt(prisma, { id: paid.id }, { config: { ok: false, reason: "not_configured" }, transport })).toBe("not_configured");
    expect(transport).not.toHaveBeenCalled();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: paid.id } })).receiptEmailSentAt).toBeNull();
  });
});
