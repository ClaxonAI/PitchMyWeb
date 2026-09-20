import { FAQSection } from "@/components/home/FAQSection";
import { FinalCTA } from "@/components/home/FinalCTA";
import { GlobalReach } from "@/components/home/GlobalReach";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { PricingTeaser } from "@/components/home/PricingTeaser";
import { Principles } from "@/components/home/Principles";
import { ProblemSection } from "@/components/home/ProblemSection";
import { SampleSites } from "@/components/home/SampleSites";
import { Testimonials } from "@/components/home/Testimonials";
import { TrustStrip } from "@/components/home/TrustStrip";

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <ProblemSection />
      <HowItWorks />
      <SampleSites />
      <GlobalReach />
      <Principles />
      <Testimonials />
      <PricingTeaser />
      <FAQSection />
      <FinalCTA />
    </>
  );
}
