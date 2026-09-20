"use client";

import { useState } from "react";
import { Check, Hand, Send } from "lucide-react";
import { CountrySelect } from "@/components/pricing/CountrySelect";
import { CouponField } from "@/components/pricing/CouponField";
import { LinkPackMock } from "@/components/pricing/LinkPackMock";
import { LinkedDevicesMock } from "@/components/pricing/LinkedDevicesMock";
import type { CheckoutOrder } from "@/components/pricing/CheckoutDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { countries, findCountry } from "@/data/countries";
import { demoCoupons, getPrice } from "@/data/plans";
import type { Market, Plan } from "@/types";
import { cn, formatPrice } from "@/lib/utils";

export function PlanCard({ plan, onCheckout }: { plan: Plan; onCheckout: (order: CheckoutOrder) => void }) {
  const [market, setMarket] = useState<Market>("india");
  const [countryCode, setCountryCode] = useState(countries[0].code);
  const [coupon, setCoupon] = useState<string | null>(null);

  const Icon = plan.id === "auto" ? Send : Hand;
  const { amount: subtotal, currency } = getPrice(plan, market);
  const discount = coupon ? Math.round(subtotal * demoCoupons[coupon] * 100) / 100 : 0;
  const total = subtotal - discount;

  return (
    <article
      className={cn(
        "relative flex flex-col border-t-2 bg-white p-5 sm:p-7",
        plan.popular ? "border-primary shadow-soft" : "border-ink/15",
      )}
    >
      {plan.popular && (
          <Badge tone="lime" className="absolute -top-2.5 right-6 rounded-none">
          Most popular
        </Badge>
      )}

      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="eyebrow flex items-center gap-2 text-ink/55">
            <Icon size={14} /> {plan.name}
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-ink/45 uppercase">{plan.bestFor}</span>
        </div>
        <h2 className="display mt-4 text-[34px] leading-tight">{plan.headline}</h2>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink/55">{plan.summary}</p>
      </header>

      <div className="mt-6">{plan.id === "auto" ? <LinkedDevicesMock /> : <LinkPackMock batchSize={plan.batchSize} />}</div>

      <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2 text-[13px] leading-snug text-ink/70">
            <Check size={15} className="mt-px shrink-0 text-primary" strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-7">
        <div className="border border-ink/10 bg-mist-2 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink/60">Where are your leads?</span>
            <SegmentedControl
              label={`${plan.name} lead market`}
              value={market}
              onChange={setMarket}
              options={[
                { value: "india", label: "India" },
                { value: "foreign", label: "Abroad" },
              ]}
              className="w-44"
            />
          </div>

          {market === "foreign" && (
            <div className="mt-3 animate-pop">
              <CountrySelect value={countryCode} onChange={setCountryCode} />
            </div>
          )}

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="flex items-baseline gap-2">
                <span className="display text-5xl leading-none">{formatPrice({ amount: total, currency })}</span>
                {coupon && (
                  <span className="font-mono text-sm text-ink/35 line-through">{formatPrice({ amount: subtotal, currency })}</span>
                )}
              </p>
              <p className="mt-1.5 text-[13px] text-ink/45">
                {plan.batchSize} {plan.unitLabel} · one-time
              </p>
            </div>
            <Button
              variant={plan.popular ? "primary" : "dark"}
              size="lg"
              arrow
              onClick={() =>
                onCheckout({ plan, market, country: findCountry(countryCode), subtotal, discount, currency, coupon })
              }
            >
              Pay
            </Button>
          </div>

          <div className="mt-4 border-t border-ink/6 pt-3.5">
            <CouponField applied={coupon} onApply={setCoupon} />
          </div>
        </div>
      </div>
    </article>
  );
}
