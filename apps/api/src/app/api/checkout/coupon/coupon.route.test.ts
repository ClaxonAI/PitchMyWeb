import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { NotFoundError } from "../../../../lib/errors";
import { handleCheckCoupon } from "./route";

const stamp = Date.now().toString(36).toUpperCase();
const codes = { live: `LIVE${stamp}`, expired: `OLD${stamp}`, usedUp: `USED${stamp}`, off: `OFF${stamp}` };

afterAll(async () => {
  await prisma.coupon.deleteMany({ where: { code: { in: Object.values(codes) } } });
  await prisma.$disconnect();
});

const check = (code: string) => handleCheckCoupon(prisma, new NextRequest(`http://localhost/api/checkout/coupon?code=${encodeURIComponent(code)}`));

describe("GET /api/checkout/coupon", () => {
  it("returns an admin-created coupon's discount, whatever the case typed", async () => {
    await prisma.coupon.create({ data: { code: codes.live, discountPercent: 30 } });
    const response = await check(codes.live.toLowerCase());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: codes.live, discountPercent: 30 });
  });

  it("is a 404 for codes create-order would not honour", async () => {
    await prisma.coupon.createMany({
      data: [
        { code: codes.expired, discountPercent: 50, expiresAt: new Date(Date.now() - 1000) },
        { code: codes.usedUp, discountPercent: 50, maxRedemptions: 1, redemptionCount: 1 },
        { code: codes.off, discountPercent: 50, active: false },
      ],
    });
    for (const code of [codes.expired, codes.usedUp, codes.off, "LAUNCH50", ""]) {
      await expect(check(code)).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});
