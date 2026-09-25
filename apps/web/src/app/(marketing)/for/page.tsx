import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingCta, LandingHero, LinkGrid } from "@/components/seo/LandingPage";
import { industries } from "@/data/industries";
import { pageMetadata } from "@/lib/seo/metadata";
import { landingPageSchema } from "@/lib/seo/structured-data";

const description = "Every kind of local business PitchMyWeb can find without a website and pitch a ready-made sample site: clinics, restaurants, salons, gyms and more.";

export const metadata: Metadata = pageMetadata({ path: "/for", title: "Industries", description });

export default function IndustriesPage() {
  const trail = [{ name: "Industries", path: "/for" }];
  return (
    <>
      <JsonLd schema={landingPageSchema({ name: "Industries", path: "/for", description, trail, type: "CollectionPage" })} />
      <LandingHero
        trail={trail}
        eyebrow="Industries"
        title="Local businesses that need a website — and how to pitch each one."
        intro="Each trade gets a sample site built on a template made for it, filled with the business's own details. Pick the one you want to sell to."
      />
      <LinkGrid title="Pick a trade" links={industries.map((industry) => ({ href: `/for/${industry.slug}`, label: industry.name, note: industry.pitchAngle }))} />
      <LandingCta title="Pick a trade. We'll find the businesses." />
    </>
  );
}
