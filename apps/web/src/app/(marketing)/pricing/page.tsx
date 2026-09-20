import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { FAQSection } from "@/components/home/FAQSection";
import { AfterPayment } from "@/components/pricing/AfterPayment";
import { PlanGrid } from "@/components/pricing/PlanGrid";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Two ways to pitch: Auto sends from your WhatsApp, Direct gives you one-tap links. Pay per batch.",
};

export default function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-mist-2 pt-14 pb-20 lg:pt-20 lg:pb-28">
        <div aria-hidden className="grid-paper pointer-events-none absolute inset-0" />
        <Container className="relative">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <div>
              <p className="eyebrow text-primary">Choose how you close</p>
              <h1 className="display mt-4 text-[46px] leading-[1] sm:text-6xl lg:text-7xl">Two ways to win clients.</h1>
            </div>
            <p className="max-w-md text-[17px] leading-relaxed text-ink/60 lg:pb-2">
              Pay per batch, from this page or the home page. A purchased batch waits for you until you press Start.
            </p>
          </div>

          <div className="mt-12">
            <PlanGrid />
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-center text-[13px] text-ink/55">
            <ShieldCheck size={16} className="shrink-0 text-primary" />
            If a batch finds fewer valid leads than promised, you get a re-run or a full refund.
          </p>
        </Container>
      </section>

      <AfterPayment />
      <div className="border-t border-ink/8">
        <FAQSection />
      </div>
    </>
  );
}
