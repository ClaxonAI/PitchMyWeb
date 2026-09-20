import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../../../lib/db/client";
import { computeRazorpaySignature } from "../../../lib/checkout/razorpay-signature";
import type { RazorpayClient } from "../../../lib/checkout/razorpay-client";
import { PaymentVerificationError } from "../../../lib/errors";
import { handleCreateOrder } from "./create-order/route";
import { handleVerifyPayment } from "./verify/route";

const KEY_SECRET = "test_secret";
const createdOrderIds: string[] = [];

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.$disconnect();
});

function req(url: string, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function fakeRazorpay(): RazorpayClient {
  return { createOrder: vi.fn(async ({ amount, currency }) => ({ id: `rzp_order_${Math.random().toString(36).slice(2)}`, amount, currency })) };
}

async function createTestOrder(body: Record<string, unknown>) {
  const response = await handleCreateOrder(prisma, req("http://localhost/api/checkout/create-order", { method: "POST", body }), fakeRazorpay());
  const parsed = await response.json();
  createdOrderIds.push(parsed.orderId);
  return parsed as { orderId: string; razorpayOrderId: string; amount: number; currency: string; keyId: string | undefined };
}

describe("POST /api/checkout/create-order (dummy)", () => {
  it("marks the order PAID without calling Razorpay when no client is injected", async () => {
    const previous = process.env.PAYMENT_GATEWAY;
    process.env.PAYMENT_GATEWAY = "dummy";
    try {
      const response = await handleCreateOrder(
        prisma,
        req("http://localhost/api/checkout/create-order", { method: "POST", body: { planId: "direct", market: "india" } }),
      );
      const parsed = (await response.json()) as { orderId: string; dummy: boolean; status: string };
      createdOrderIds.push(parsed.orderId);
      expect(parsed.dummy).toBe(true);
      expect(parsed.status).toBe("PAID");
      const stored = await prisma.order.findUnique({ where: { id: parsed.orderId } });
      expect(stored?.status).toBe("PAID");
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_GATEWAY;
      else process.env.PAYMENT_GATEWAY = previous;
    }
  });
});

describe("POST /api/checkout/create-order", () => {
  it("computes the amount server-side and returns the local + razorpay order ids", async () => {
    const order = await createTestOrder({ planId: "direct", market: "india" });
    expect(order.amount).toBe(28900);
    expect(order.currency).toBe("INR");
    expect(order.orderId).toBeTruthy();
    expect(order.razorpayOrderId).toMatch(/^rzp_order_/);
  });

  it("rejects an unknown planId", async () => {
    await expect(
      handleCreateOrder(prisma, req("http://localhost/api/checkout/create-order", { method: "POST", body: { planId: "enterprise", market: "india" } }), fakeRazorpay()),
    ).rejects.toThrow(ZodError);
  });

  it("rejects a body with an unexpected field", async () => {
    await expect(
      handleCreateOrder(
        prisma,
        req("http://localhost/api/checkout/create-order", { method: "POST", body: { planId: "auto", market: "india", amount: 1 } }),
        fakeRazorpay(),
      ),
    ).rejects.toThrow(ZodError);
  });
});

describe("POST /api/checkout/verify", () => {
  it("marks the order PAID when the signature matches", async () => {
    const order = await createTestOrder({ planId: "auto", market: "india" });
    const signature = computeRazorpaySignature(KEY_SECRET, order.razorpayOrderId, "pay_123");

    const response = await handleVerifyPayment(
      prisma,
      req("http://localhost/api/checkout/verify", { method: "POST", body: { orderId: order.orderId, razorpayPaymentId: "pay_123", razorpaySignature: signature } }),
      KEY_SECRET,
    );

    expect(await response.json()).toEqual({ orderId: order.orderId, status: "PAID", claimed: false });
  });

  it("rejects a forged signature and never marks the order PAID", async () => {
    const order = await createTestOrder({ planId: "auto", market: "india" });

    await expect(
      handleVerifyPayment(
        prisma,
        req("http://localhost/api/checkout/verify", { method: "POST", body: { orderId: order.orderId, razorpayPaymentId: "pay_123", razorpaySignature: "forged" } }),
        KEY_SECRET,
      ),
    ).rejects.toThrow(PaymentVerificationError);

    const stored = await prisma.order.findUnique({ where: { id: order.orderId } });
    expect(stored?.status).toBe("FAILED");
  });

  it("rejects missing fields", async () => {
    await expect(
      handleVerifyPayment(prisma, req("http://localhost/api/checkout/verify", { method: "POST", body: { orderId: "x" } }), KEY_SECRET),
    ).rejects.toThrow(ZodError);
  });
});
