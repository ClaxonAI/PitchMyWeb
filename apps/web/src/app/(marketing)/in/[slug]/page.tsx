import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { FaqList, LandingCta, LandingHero, LandingSection, LinkGrid } from "@/components/seo/LandingPage";
import { cities, findCity } from "@/data/cities";
import { findIndustry, industries } from "@/data/industries";
import { cityFaqs, HOW_IT_WORKS_STEPS } from "@/lib/seo/landing-copy";
import { pageMetadata } from "@/lib/seo/metadata";
import { landingPageSchema } from "@/lib/seo/structured-data";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return cities.map((city) => ({ slug: city.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const city = findCity((await params).slug);
  if (!city) return {};
  return pageMetadata({
    path: `/in/${city.slug}`,
    title: `Find businesses without a website in ${city.name}`,
    description: `Find local businesses in ${city.name} that have no website, send each a sample site and demo video on WhatsApp, and win them as web design clients.`,
  });
}

export default async function CityPage({ params }: Params) {
  const city = findCity((await params).slug);
  if (!city) notFound();

  const path = `/in/${city.slug}`;
  const trail = [
    { name: "Cities", path: "/in" },
    { name: city.name, path },
  ];
  const focus = city.focus.map(findIndustry).filter((industry) => industry !== undefined);
  const rest = industries.filter((industry) => !city.focus.includes(industry.slug));
  const nearby = cities.filter((other) => other.slug !== city.slug && other.state === city.state);
  const moreCities = nearby.length > 0 ? nearby : cities.filter((other) => other.slug !== city.slug).slice(0, 6);

  return (
    <>
      <JsonLd
        schema={landingPageSchema({
          name: `Businesses without a website in ${city.name}`,
          path,
          description: `Find and pitch local businesses in ${city.name}, ${city.state} that have no website.`,
          trail,
          faqs: cityFaqs(city),
        })}
      />
      <LandingHero
        trail={trail}
        eyebrow={`${city.name}, ${city.state}`}
        title={`Win web design clients in ${city.name} who don't have a site yet.`}
        intro={`Plenty of ${city.name} businesses are found on a map but have nowhere to send a customer next. PitchMyWeb finds them, builds each a sample site, and pitches it from your WhatsApp.`}
      />
      <LandingSection title={`Where to start in ${city.name}`}>
        <p>
          Good first searches in {city.name}: {focus.map((industry) => industry.name.toLowerCase()).join(", ")}. Each gets a sample site on a template built
          for its trade, and you can narrow any search to a single neighbourhood.
        </p>
      </LandingSection>
      <LandingSection title="How it works">
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </LandingSection>
      <LinkGrid
        title={`Trades to pitch in ${city.name}`}
        links={[...focus, ...rest].map((industry) => ({ href: `/for/${industry.slug}`, label: industry.name }))}
      />
      <FaqList faqs={cityFaqs(city)} />
      <LinkGrid
        title={nearby.length > 0 ? `More of ${city.state}` : "Other cities"}
        links={moreCities.map((other) => ({ href: `/in/${other.slug}`, label: other.name, note: other.state }))}
      />
      <LandingCta title={`Start your first ${city.name} campaign.`} />
    </>
  );
}
