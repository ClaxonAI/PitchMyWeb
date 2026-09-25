import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingCta, LandingHero, LinkGrid } from "@/components/seo/LandingPage";
import { cities } from "@/data/cities";
import { pageMetadata } from "@/lib/seo/metadata";
import { landingPageSchema } from "@/lib/seo/structured-data";

const description = "Cities where PitchMyWeb finds local businesses with no website and pitches them a ready-made sample site on WhatsApp.";

export const metadata: Metadata = pageMetadata({ path: "/in", title: "Cities", description });

export default function CitiesPage() {
  const trail = [{ name: "Cities", path: "/in" }];
  return (
    <>
      <JsonLd schema={landingPageSchema({ name: "Cities", path: "/in", description, trail, type: "CollectionPage" })} />
      <LandingHero
        trail={trail}
        eyebrow="Cities"
        title="Find businesses without a website, city by city."
        intro="Search any city or neighbourhood when you start a campaign. These are good places to begin."
      />
      <LinkGrid title="Pick a city" links={cities.map((city) => ({ href: `/in/${city.slug}`, label: city.name, note: city.state }))} />
      <LandingCta title="Pick a city. We'll find the businesses." />
    </>
  );
}
