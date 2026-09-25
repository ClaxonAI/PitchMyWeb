import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { BulletList, FaqList, LandingCta, LandingHero, LandingSection, LinkGrid } from "@/components/seo/LandingPage";
import { cities } from "@/data/cities";
import { findIndustry, industries, templateLabel } from "@/data/industries";
import { HOW_IT_WORKS_STEPS, industryFaqs } from "@/lib/seo/landing-copy";
import { pageMetadata } from "@/lib/seo/metadata";
import { landingPageSchema } from "@/lib/seo/structured-data";

type Params = { params: Promise<{ slug: string }> };

// Every industry is known at build time: prerender them all and 404 the rest.
export const dynamicParams = false;
export function generateStaticParams() {
  return industries.map((industry) => ({ slug: industry.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const industry = findIndustry((await params).slug);
  if (!industry) return {};
  return pageMetadata({
    path: `/for/${industry.slug}`,
    title: `Sell websites to ${industry.name.toLowerCase()}`,
    description: `Find ${industry.name.toLowerCase()} with no website, send each a ready-made sample site and demo video on WhatsApp, and close the sale. ${industry.pitchAngle}`,
  });
}

export default async function IndustryPage({ params }: Params) {
  const industry = findIndustry((await params).slug);
  if (!industry) notFound();

  const path = `/for/${industry.slug}`;
  const trail = [
    { name: "Industries", path: "/for" },
    { name: industry.name, path },
  ];
  const faqs = industryFaqs(industry);
  const related = industries.filter((other) => other.slug !== industry.slug && other.template === industry.template);
  const others = industries.filter((other) => other.slug !== industry.slug && other.template !== industry.template).slice(0, 6 - Math.min(related.length, 6));
  const cityLinks = cities.filter((city) => city.focus.includes(industry.slug));

  return (
    <>
      <JsonLd
        schema={landingPageSchema({ name: `Sell websites to ${industry.name.toLowerCase()}`, path, description: industry.why, trail, faqs })}
      />
      <LandingHero
        trail={trail}
        eyebrow={`For ${industry.name.toLowerCase()}`}
        title={`Pitch ${industry.name.toLowerCase()} a website they can already see.`}
        intro={`${industry.why} PitchMyWeb finds ${industry.name.toLowerCase()} without a site, builds each one a sample, and sends it from your WhatsApp.`}
      />
      <LandingSection title="What each sample site shows">
        <p>
          Every lead gets a page on our {templateLabel[industry.template]} template, filled with the business&apos;s own name, category and
          address:
        </p>
        <BulletList items={industry.siteSections} />
        <p>{industry.pitchAngle}</p>
      </LandingSection>
      <LandingSection title="How it works">
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          To start, type a category such as {industry.searchTerms.map((term) => `“${term}”`).join(", ")} and the area you want to cover.
        </p>
      </LandingSection>
      <FaqList faqs={faqs} />
      {cityLinks.length > 0 && (
        <LinkGrid
          title={`Where to start with ${industry.name.toLowerCase()}`}
          links={cityLinks.map((city) => ({ href: `/in/${city.slug}`, label: city.name, note: city.state }))}
        />
      )}
      <LinkGrid
        title="Other trades you can pitch"
        links={[...related, ...others].map((other) => ({ href: `/for/${other.slug}`, label: other.name }))}
      />
      <LandingCta title={`Your first ${industry.name.toLowerCase()} are one search away.`} />
    </>
  );
}
