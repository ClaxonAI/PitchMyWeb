import { Check, Hand, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getPrice, plans } from "@/data/plans";
import { cn, formatPrice } from "@/lib/utils";

export function PricingTeaser() {
  return (
    <section className="bg-mist py-24 lg:py-32">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          title="Pay per batch. No subscription."
          body="Pick how you want to send. Choose India or abroad at checkout; every batch is a one-time purchase."
        />

        <div className="mx-auto mt-14 grid max-w-4xl gap-4 md:grid-cols-2">
          {plans.map((plan) => {
            const Icon = plan.id === "auto" ? Send : Hand;
            const dark = plan.popular;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col border-t-2 p-7 sm:p-8",
                  dark ? "bg-ink text-white shadow-lift" : "border border-ink/8 bg-white",
                )}
              >
                {/* Popular badge — top right corner */}
                {plan.popular && (
                  <div className="absolute -top-3 right-6">
                    <Badge tone="lime">Most popular</Badge>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className={cn("grid size-8 place-items-center rounded-xl", dark ? "bg-white/10" : "bg-primary/8")}>
                    <Icon size={15} className={dark ? "text-lilac" : "text-primary"} />
                  </span>
                  <span className={cn("eyebrow", dark ? "text-white/50" : "text-ink/60")}>{plan.name}</span>
                </div>

                <h3 className="display mt-5 text-3xl leading-tight">{plan.headline}</h3>

                <p className="mt-6 flex items-baseline gap-2">
                  <span className="display text-[4rem] leading-none font-normal tabular-nums">
                    {formatPrice(getPrice(plan, "india"))}
                  </span>
                  <span className={cn("text-sm leading-snug", dark ? "text-white/60" : "text-ink/60")}>
                    per batch<br />
                    of {plan.batchSize} {plan.unitLabel}
                  </span>
                </p>

                <ul className="mt-8 flex-1 space-y-3.5 border-t pt-7 border-current/10">
                  {plan.features.map((f) => (
                    <li key={f} className={cn("flex items-start gap-3 text-[14px]", dark ? "text-white/70" : "text-ink/65")}>
                      <Check size={15} className={cn("mt-0.5 shrink-0", dark ? "text-lime" : "text-primary")} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button href="/pricing" variant={dark ? "light" : "dark"} arrow className="mt-8 w-full">
                  Choose {plan.name}
                </Button>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
