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
      {/* Above the fold, or close enough to it that skipping layout would be
          the more expensive choice: these render normally. */}
      <Hero />
      <TrustStrip />

      {/* Everything below still ships in the HTML — this only tells the
          browser it may defer laying it out until it nears the viewport.
          See the defer-offscreen utility in globals.css for the trade-off. */}
      <div className="defer-offscreen">
        <ProblemSection />
      </div>
      <div className="defer-offscreen">
        <HowItWorks />
      </div>
      <div className="defer-offscreen">
        <SampleSites />
      </div>
      <div className="defer-offscreen">
        <GlobalReach />
      </div>
      <div className="defer-offscreen">
        <Principles />
      </div>
      <div className="defer-offscreen">
        <Testimonials />
      </div>
      <div className="defer-offscreen">
        <PricingTeaser />
      </div>
      <div className="defer-offscreen">
        <FAQSection />
      </div>
      <div className="defer-offscreen">
        <FinalCTA />
      </div>
    </>
  );
}
