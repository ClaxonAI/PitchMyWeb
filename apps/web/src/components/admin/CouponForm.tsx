"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";

export function CouponForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("20");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post("/api/admin/coupons", { code, discountPercent: Number(discountPercent), maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null });
      setCode("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create coupon");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
      <label className="text-sm">Code<input required value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 h-9 w-full rounded-dash-md border border-dash-border bg-dash-background px-3 uppercase" /></label>
      <label className="text-sm">Discount %<input required type="number" min="1" max="100" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} className="mt-1 h-9 w-full rounded-dash-md border border-dash-border bg-dash-background px-3" /></label>
      <label className="text-sm">Max uses<input type="number" min="1" value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} className="mt-1 h-9 w-full rounded-dash-md border border-dash-border bg-dash-background px-3" /></label>
      <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create coupon"}</Button>
      {error ? <p className="text-sm text-dash-destructive sm:col-span-full">{error}</p> : null}
    </form>
  );
}