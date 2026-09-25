import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingCta, LandingHero, LandingSection } from "@/components/seo/LandingPage";
import { HowItWorks } from "@/components/home/HowItWorks";
import { HOW_IT_WORKS_STEPS } from "@/lib/seo/landing-copy";
import { pageMetadata } from "@/lib/seo/metadata";
import { landingPageSchema } from "@/lib/seo/structured-data";

const description = "How PitchMyWeb finds local businesses without a website, builds each a sample site and demo video, and pitches it from your WhatsApp.";

export const metadata: Metadata = pageMetadata({ path: "/how-it-works", title: "How it works", description });

export default function HowItWorksPage() {
  const trail = [{ name: "How it works", path: "/how-it-works" }];
  return (
    <>
      <JsonLd schema={landingPageSchema({ name: "How it works", path: "/how-it-works", description, trail })} />
      <LandingHero
        trail={trail}
        eyebrow="How it works"
        title="From a search to a reply, without building anything by hand."
        intro="Four steps, and three of them happen without you."
      />
      <HowItWorks />
      <LandingSection title="Step by step">
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </LandingSection>
      <LandingCta title="Run your first campaign today." />
    </>
  );
}
