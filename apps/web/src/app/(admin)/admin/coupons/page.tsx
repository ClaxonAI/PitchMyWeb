import type { Metadata } from "next";
import { adminFetch } from "@/lib/admin-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { CouponForm } from "@/components/admin/CouponForm";

export const metadata: Metadata = { title: "Coupons" };

type Coupon = { id: string; code: string; discountPercent: number; active: boolean; maxRedemptions: number | null; redemptionCount: number; expiresAt: string | null };

export default async function AdminCouponsPage() {
  const coupons = (await adminFetch<Coupon[]>("/api/admin/coupons")) ?? [];
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div><h1 className="display text-2xl text-dash-foreground">Coupons</h1><p className="mt-1 text-sm text-dash-muted-foreground">Create and monitor checkout discounts.</p></div>
      <Card><CardHeader><CardTitle>Create coupon</CardTitle></CardHeader><CardContent><CouponForm /></CardContent></Card>
      <Card><CardHeader><CardTitle>Active codes</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-dash-border text-dash-muted-foreground"><th className="p-2">Code</th><th className="p-2">Discount</th><th className="p-2">Uses</th><th className="p-2">Expires</th></tr></thead><tbody>{coupons.map((coupon) => <tr key={coupon.id} className="border-b border-dash-border last:border-0"><td className="p-2 font-mono">{coupon.code}</td><td className="p-2">{coupon.discountPercent}%</td><td className="p-2">{coupon.redemptionCount}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ""}</td><td className="p-2">{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : "No expiry"}</td></tr>)}</tbody></table>{coupons.length === 0 ? <p className="text-sm text-dash-muted-foreground">No coupons yet.</p> : null}</CardContent></Card>
    </div>
  );
}