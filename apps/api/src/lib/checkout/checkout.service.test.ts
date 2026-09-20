import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@pitchmyweb/db";
import { createOrder, createDummyPaidOrder, isDummyPaymentGateway, verifyPayment, claimOrder } from "./checkout.service";
import { computeRazorpaySignature } from "./razorpay-signature";
import type { RazorpayClient } from "./razorpay-client";
import { NotFoundError, PaymentVerificationError } from "../errors";

type FakeOrder = {
  id: string;
  userId: string | null;
  planId: string;
  market: string;
  countryCode: string | null;
  couponCode: string | null;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "FAILED";
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
};

function createFakeDb() {
  const orders: FakeOrder[] = [];
  const users: Record<string, { planId: string | null }> = {};
  let nextId = 1;

  const client = {
    order: {
      create: async ({ data }: { data: Partial<FakeOrder> }) => {
        const order: FakeOrder = {
          id: `order-${nextId++}`,
          userId: null,
          countryCode: null,
          couponCode: null,
          razorpayPaymentId: null,
          razorpaySignature: null,
          ...data,
        } as FakeOrder;
        orders.push(order);
        return order;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeOrder> }) => {
        const order = orders.find((o) => o.id === where.id);
        if (!order) throw new Error(`fake db: order ${where.id} not found`);
        Object.assign(order, data);
        return order;
      },
      updateMany: async ({ where, data }: { where: { id: string; userId: null; status: string }; data: Partial<FakeOrder> }) => {
        const matches = orders.filter((o) => o.id === where.id && o.userId === where.userId && o.status === where.status);
        for (const order of matches) Object.assign(order, data);
        return { count: matches.length };
      },
      findUnique: async ({ where }: { where: { id: string } }) => orders.find((o) => o.id === where.id) ?? null,
    },
    coupon: {
      findUnique: async ({ where }: { where: { code: string } }) => {
        const discountPercent = where.code === "LAUNCH50" ? 50 : where.code === "FIRSTPITCH" ? 20 : null;
        return discountPercent === null
          ? null
          : { id: `coupon-${where.code}`, code: where.code, discountPercent, active: true, expiresAt: null, maxRedemptions: null, redemptionCount: 0 };
      },
    },
    user: {
      update: async ({ where, data }: { where: { id: string }; data: { planId: string | null } }) => {
        users[where.id] = { ...(users[where.id] ?? { planId: null }), ...data };
        return { id: where.id, ...users[where.id] };
      },
    },
  };

  return { db: client as unknown as Prisma.TransactionClient, orders, users };
}

function fakeRazorpay(overrides: Partial<RazorpayClient> = {}): RazorpayClient {
  return {
    createOrder: vi.fn(async ({ amount, currency }) => ({ id: `rzp_order_${amount}`, amount, currency })),
    ...overrides,
  };
}

describe("createOrder", () => {
  it("computes the amount server-side and persists a PENDING order with the razorpay order id", async () => {
    const { db, orders } = createFakeDb();
    const razorpay = fakeRazorpay();

    const result = await createOrder(db, razorpay, { planId: "direct", market: "india" });

    expect(result.amount).toBe(28900);
    expect(result.currency).toBe("INR");
    expect(result.razorpayOrderId).toBe("rzp_order_28900");
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ status: "PENDING", amount: 28900, razorpayOrderId: "rzp_order_28900" });
  });

  it("never trusts a client-submitted amount — only planId/market/couponCode reach computeOrderAmount", async () => {
    const { db } = createFakeDb();
    const razorpay = fakeRazorpay();
    const result = await createOrder(db, razorpay, { planId: "auto", market: "foreign", couponCode: "LAUNCH50" });
    expect(result.amount).toBe(16450); // 32900 - 50%
  });

  // No current plan/market/coupon combination actually falls below Razorpay's
  // 100-unit minimum (the smallest is auto/foreign at 50% off = 140 cents),
  // so the floor check in createOrder is defense-in-depth for a future price
  // change rather than something reachable via real input today — nothing
  // meaningful to assert here beyond computeOrderAmount's own arithmetic
  // tests (plan-pricing.test.ts).
});

describe("dummy payment gateway", () => {
  it("defaults to dummy unless PAYMENT_GATEWAY=razorpay", () => {
    expect(isDummyPaymentGateway({})).toBe(true);
    expect(isDummyPaymentGateway({ PAYMENT_GATEWAY: "dummy" })).toBe(true);
    expect(isDummyPaymentGateway({ PAYMENT_GATEWAY: "razorpay" })).toBe(false);
  });

  it("creates a PAID order that can be claimed in one step", async () => {
    const { db, orders, users } = createFakeDb();
    const created = await createDummyPaidOrder(db, { planId: "direct", market: "india" });
    expect(created.dummy).toBe(true);
    expect(created.amount).toBe(28900);
    expect(orders[0]?.status).toBe("PAID");
    expect(orders[0]?.razorpayOrderId).toMatch(/^dummy_/);

    await claimOrder(db, created.orderId, "user-1");
    expect(orders[0]?.userId).toBe("user-1");
    expect(users["user-1"]?.planId).toBe("direct");
  });
});

describe("verifyPayment", () => {
  const KEY_SECRET = "test_secret";

  it("marks the order PAID when the signature matches", async () => {
    const { db, orders } = createFakeDb();
    const razorpay = fakeRazorpay();
    const created = await createOrder(db, razorpay, { planId: "auto", market: "india" });
    const signature = computeRazorpaySignature(KEY_SECRET, created.razorpayOrderId, "pay_123");

    const result = await verifyPayment(db, KEY_SECRET, { orderId: created.orderId, razorpayPaymentId: "pay_123", razorpaySignature: signature });

    expect(result.status).toBe("PAID");
    expect(orders[0]).toMatchObject({ status: "PAID", razorpayPaymentId: "pay_123", razorpaySignature: signature });
  });

  it("marks the order FAILED and throws when the signature does not match", async () => {
    const { db, orders } = createFakeDb();
    const razorpay = fakeRazorpay();
    const created = await createOrder(db, razorpay, { planId: "auto", market: "india" });

    await expect(
      verifyPayment(db, KEY_SECRET, { orderId: created.orderId, razorpayPaymentId: "pay_123", razorpaySignature: "forged" }),
    ).rejects.toThrow(PaymentVerificationError);
    expect(orders[0]?.status).toBe("FAILED");
  });

  it("throws NotFoundError for an order id that does not exist", async () => {
    const { db } = createFakeDb();
    await expect(verifyPayment(db, KEY_SECRET, { orderId: "does-not-exist", razorpayPaymentId: "pay_123", razorpaySignature: "x" })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("is idempotent: re-verifying an already-PAID order returns it without re-checking the signature", async () => {
    const { db } = createFakeDb();
    const razorpay = fakeRazorpay();
    const created = await createOrder(db, razorpay, { planId: "auto", market: "india" });
    const signature = computeRazorpaySignature(KEY_SECRET, created.razorpayOrderId, "pay_123");
    await verifyPayment(db, KEY_SECRET, { orderId: created.orderId, razorpayPaymentId: "pay_123", razorpaySignature: signature });

    // A garbage signature on the second call must not flip a PAID order to FAILED.
    const result = await verifyPayment(db, KEY_SECRET, { orderId: created.orderId, razorpayPaymentId: "pay_123", razorpaySignature: "garbage" });
    expect(result.status).toBe("PAID");
  });
});

describe("claimOrder", () => {
  it("attaches a PAID, unclaimed order to the given user", async () => {
    const { db, orders, users } = createFakeDb();
    const razorpay = fakeRazorpay();
    const created = await createOrder(db, razorpay, { planId: "auto", market: "india" });
    const signature = computeRazorpaySignature("test_secret", created.razorpayOrderId, "pay_123");
    await verifyPayment(db, "test_secret", { orderId: created.orderId, razorpayPaymentId: "pay_123", razorpaySignature: signature });

    await claimOrder(db, created.orderId, "user-1");

    expect(orders[0]?.userId).toBe("user-1");
    expect(users["user-1"]?.planId).toBe("auto");
  });

  it("is a no-op for an order that is not PAID", async () => {
    const { db, orders } = createFakeDb();
    const razorpay = fakeRazorpay();
    const created = await createOrder(db, razorpay, { planId: "auto", market: "india" });

    await claimOrder(db, created.orderId, "user-1");

    expect(orders[0]?.userId).toBeNull();
  });

  it("is a no-op for an order that is already claimed by someone else", async () => {
    const { db, orders } = createFakeDb();
    const razorpay = fakeRazorpay();
    const created = await createOrder(db, razorpay, { planId: "auto", market: "india" });
    const signature = computeRazorpaySignature("test_secret", created.razorpayOrderId, "pay_123");
    await verifyPayment(db, "test_secret", { orderId: created.orderId, razorpayPaymentId: "pay_123", razorpaySignature: signature });
    await claimOrder(db, created.orderId, "user-1");

    await claimOrder(db, created.orderId, "user-2");

    expect(orders[0]?.userId).toBe("user-1");
  });

  it("is a no-op for an unknown order id", async () => {
    const { db } = createFakeDb();
    await expect(claimOrder(db, "does-not-exist", "user-1")).resolves.toBeUndefined();
  });
});
