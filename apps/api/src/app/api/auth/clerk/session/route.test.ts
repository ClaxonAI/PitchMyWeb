import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { deleteTestUsers } from "../../../../../lib/testing/db-test-helpers";

// Google/GitHub sign-in (through Clerk) must claim the order just paid for,
// as the email form does — whatever email Razorpay recorded for the payment.

const clerkEmail = `clerk-order-${Date.now()}@example.com`;

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(async () => ({ sub: `user_clerk_${Date.now()}` })),
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: vi.fn(async () => ({
        primaryEmailAddress: { emailAddress: clerkEmail, verification: { status: "verified" } },
        firstName: "Test",
        lastName: null,
        imageUrl: null,
      })),
    },
  })),
}));

const { handleClerkSession } = await import("./route");

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];

beforeEach(() => {
  process.env.CLERK_SECRET_KEY = "sk_test_dummy";
});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/clerk/session", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/clerk/session", () => {
  it("claims the posted paid order even when it was paid with another email", async () => {
    const order = await prisma.order.create({
      data: {
        userId: null,
        planId: "auto",
        market: "india",
        amount: 14900,
        currency: "INR",
        status: "PAID",
        credits: 20,
        payerEmail: "someone-else@example.com",
        razorpayOrderId: `test_clerk_${Date.now()}`,
        razorpayPaymentId: `pay_clerk_${Date.now()}`,
        razorpaySignature: "test",
      },
    });
    createdOrderIds.push(order.id);

    const response = await handleClerkSession(prisma, request({ orderId: order.id }));
    expect(response.status).toBe(200);
    const { id: userId } = (await response.json()) as { id: string };
    createdUserIds.push(userId);

    const claimed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(claimed.userId).toBe(userId);
    const purchase = await prisma.pitchCreditLedger.findFirst({ where: { userId, referenceId: `purchase:${order.id}` } });
    expect(purchase?.amount).toBe(20);
  });

  it("still signs in with no body or a malformed order id", async () => {
    const empty = await handleClerkSession(prisma, request({}));
    expect(empty.status).toBe(200);
    const bad = await handleClerkSession(prisma, request({ orderId: "../../etc" }));
    expect(bad.status).toBe(200);
  });
});
