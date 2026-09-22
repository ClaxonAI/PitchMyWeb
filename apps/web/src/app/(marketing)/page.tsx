import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { landingPageGraph } from "@/lib/structured-data";
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

// The title and description come from the root layout -- this page is the
// site's default, so it has nothing to override. Only the canonical is
// page-specific: without it, any URL that resolves here (a trailing slash, a
// ?utm_source= from a campaign, a shared link with a fragment) can be indexed
// as a separate document competing with this one.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={landingPageGraph()} />

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
