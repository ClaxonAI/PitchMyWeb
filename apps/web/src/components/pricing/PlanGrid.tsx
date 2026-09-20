"use client";

import { useState } from "react";
import { CheckoutDialog, type CheckoutOrder } from "@/components/pricing/CheckoutDialog";
import { PlanCard } from "@/components/pricing/PlanCard";
import { plans } from "@/data/plans";

export function PlanGrid() {
  const [order, setOrder] = useState<CheckoutOrder | null>(null);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onCheckout={setOrder} />
        ))}
      </div>
      <CheckoutDialog order={order} onClose={() => setOrder(null)} />
    </>
  );
}
