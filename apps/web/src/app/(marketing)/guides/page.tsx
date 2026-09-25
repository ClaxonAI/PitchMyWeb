import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingCta, LandingHero, LinkGrid } from "@/components/seo/LandingPage";
import { guides } from "@/data/guides";
import { pageMetadata } from "@/lib/seo/metadata";
import { landingPageSchema } from "@/lib/seo/structured-data";

const description = "Practical guides for freelancers and agencies selling websites to local businesses: finding leads, pitching on WhatsApp, pricing and follow-up.";

export const metadata: Metadata = pageMetadata({ path: "/guides", title: "Guides", description });

export default function GuidesPage() {
  const trail = [{ name: "Guides", path: "/guides" }];
  return (
    <>
      <JsonLd schema={landingPageSchema({ name: "Guides", path: "/guides", description, trail, type: "CollectionPage" })} />
      <LandingHero
        trail={trail}
        eyebrow="Guides"
        title="Selling websites to local businesses, step by step."
        intro="How to find businesses without a site, pitch them on WhatsApp, price the work and follow up."
      />
      <LinkGrid title="All guides" links={guides.map((guide) => ({ href: `/guides/${guide.slug}`, label: guide.title, note: guide.description }))} />
      <LandingCta title="Put the guides to work." />
    </>
  );
}
