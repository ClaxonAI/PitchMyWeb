import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../../lib/testing/db-test-helpers";
import { handleRazorpayWebhook } from "./route";

const SECRET = "whsec_test_secret_value";
const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

async function pendingOrder(buyerId: string | null) {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const order = await prisma.order.create({
    data: { planId: "auto", market: "india", amount: 99900, currency: "INR", credits: 20, status: "PENDING", razorpayOrderId: `order_${suffix}`, buyerId },
  });
  createdOrderIds.push(order.id);
  return order;
}

function event(razorpayOrderId: string, options: { status?: string; email?: string; type?: string } = {}) {
  return JSON.stringify({
    event: options.type ?? "payment.captured",
    payload: { payment: { entity: { id: `pay_${razorpayOrderId}`, order_id: razorpayOrderId, email: options.email ?? "Buyer@Example.test", status: options.status ?? "captured" } } },
  });
}

function signed(body: string, signature = createHmac("sha256", SECRET).update(body).digest("hex")) {
  return new NextRequest("http://localhost/api/checkout/webhook", { method: "POST", headers: { "x-razorpay-signature": signature }, body });
}

describe("POST /api/checkout/webhook", () => {
  it("refuses a missing or wrong signature, and answers 503 when unconfigured", async () => {
    const order = await pendingOrder(null);
    const body = event(order.razorpayOrderId);
    expect((await handleRazorpayWebhook(prisma, signed(body, "bad"), SECRET)).status).toBe(401);
    expect((await handleRazorpayWebhook(prisma, new NextRequest("http://localhost/x", { method: "POST", body }), SECRET)).status).toBe(401);
    expect((await handleRazorpayWebhook(prisma, signed(body), "")).status).toBe(503);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("marks the order PAID with the payer's email and credits a signed-in buyer, once", async () => {
    const buyer = await createTestUser("webhook-buyer");
    createdUserIds.push(buyer.id);
    const order = await pendingOrder(buyer.id);
    const body = event(order.razorpayOrderId);

    const first = await handleRazorpayWebhook(prisma, signed(body), SECRET);
    expect(await first.json()).toEqual({ outcome: "paid" });
    // A repeated delivery changes nothing.
    expect(await (await handleRazorpayWebhook(prisma, signed(body), SECRET)).json()).toEqual({ outcome: "already_paid" });

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid).toMatchObject({ status: "PAID", userId: buyer.id, payerEmail: "buyer@example.test", razorpayPaymentId: `pay_${order.razorpayOrderId}` });
    const purchases = await prisma.pitchCreditLedger.findMany({ where: { userId: buyer.id, type: "PURCHASE" } });
    expect(purchases).toHaveLength(1);
    expect(purchases[0]!.amount).toBe(20);
  });

  it("leaves an anonymous order unowned (claimed later by email or order link)", async () => {
    const order = await pendingOrder(null);
    await handleRazorpayWebhook(prisma, signed(event(order.razorpayOrderId)), SECRET);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "PAID", userId: null });
  });

  it("ignores events it does not act on, and unknown orders", async () => {
    const order = await pendingOrder(null);
    expect(await (await handleRazorpayWebhook(prisma, signed(event(order.razorpayOrderId, { type: "payment.failed", status: "failed" })), SECRET)).json()).toEqual({ ignored: true });
    expect(await (await handleRazorpayWebhook(prisma, signed(event("order_nope")), SECRET)).json()).toEqual({ outcome: "unknown_order" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });
});
