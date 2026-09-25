import type { Faq } from "@/types";
import { faqs, pricingFaqs } from "@/data/faq";
import { plans } from "@/data/plans";
import { siteConfig } from "@/data/site";
import { absoluteUrl, siteUrl } from "@/lib/seo/site-url";

// schema.org graphs, built from the same data files the pages render from —
// so a price or an FAQ answer cannot say one thing in the markup and another
// in the structured data, which is the mismatch Google penalises.
//
// Stable @ids let the separate graphs reference each other: the Organization
// is declared once on the home page and every other page's breadcrumb and
// page node points at it by id rather than repeating it.

const ORGANIZATION_ID = `${siteUrl}/#organization`;
const WEBSITE_ID = `${siteUrl}/#website`;

export function organizationSchema() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: siteConfig.name,
    url: siteUrl,
    email: siteConfig.email,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/images/FaviconLogo.png"),
      width: 500,
      height: 500,
    },
    description:
      "PitchMyWeb finds local businesses without a website, builds each one a real sample site and demo, and pitches it from your WhatsApp.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: siteConfig.email,
      url: absoluteUrl("/contact"),
      availableLanguage: ["en"],
    },
  };
}

function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: siteUrl,
    name: siteConfig.name,
    publisher: { "@id": ORGANIZATION_ID },
    inLanguage: "en",
  };
}

/**
 * Breadcrumbs for a page one level below the home page. Google renders these
 * in place of the raw URL under the result title.
 */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

// Each page marks up its own questions. This is only safe because the two
// sets are disjoint (see data/faq.ts): marking up the same answers under two
// @ids would be telling Google the pages are interchangeable, which is the
// duplication the split exists to remove.
function faqSchema(id: string, entries: Faq[]) {
  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity: entries.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/**
 * The batches as a Service rather than a Product: nothing is shipped, and a
 * Product here would put the page in front of merchant-listing validation it
 * can never satisfy (no GTIN, no shipping, no returns feed).
 *
 * Prices are the Indian-market ones — the currency is INR for every market
 * (see data/plans.ts), and quoting the resident price is what a searcher in
 * the primary market sees on the page.
 */
function pricingSchema() {
  const indiaPrices = plans.map((plan) => plan.prices.find((price) => price.market === "india") ?? plan.prices[0]);

  return {
    "@type": "Service",
    "@id": `${siteUrl}/pricing#service`,
    name: "PitchMyWeb pitch batches",
    serviceType: "Website sales lead generation",
    provider: { "@id": ORGANIZATION_ID },
    url: absoluteUrl("/pricing"),
    description:
      "Batches of verified local businesses with no website, each with a custom sample site and demo recording, pitched from your own WhatsApp.",
    offers: plans.map((plan, index) => ({
      "@type": "Offer",
      name: `${plan.name} — ${plan.batchSize} ${plan.unitLabel}`,
      description: plan.summary,
      price: indiaPrices[index].amount,
      priceCurrency: indiaPrices[index].currency,
      url: absoluteUrl("/pricing"),
      availability: "https://schema.org/InStock",
      category: plan.bestFor,
    })),
  };
}

/** One @graph per page, so a single <script> carries everything that page claims. */
function graph(nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}

export function homeSchema() {
  return graph([
    organizationSchema(),
    websiteSchema(),
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/#webpage`,
      url: siteUrl,
      name: "PitchMyWeb — Show them the website before they ask for one",
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": ORGANIZATION_ID },
      inLanguage: "en",
    },
    faqSchema(`${siteUrl}/#faq`, faqs),
  ]);
}

export function pricingSchemaGraph() {
  return graph([
    breadcrumbSchema([{ name: "Pricing", path: "/pricing" }]),
    pricingSchema(),
    faqSchema(`${siteUrl}/pricing#faq`, pricingFaqs),
  ]);
}

export function simplePageSchema(name: string, path: string, type: "ContactPage" | "WebPage" = "WebPage") {
  return graph([
    breadcrumbSchema([{ name, path }]),
    {
      "@type": type,
      "@id": `${absoluteUrl(path)}#webpage`,
      url: absoluteUrl(path),
      name,
      isPartOf: { "@id": WEBSITE_ID },
      inLanguage: "en",
    },
  ]);
}

/**
 * The SEO landing pages (industries, cities, guides and their hubs):
 * breadcrumbs, the page node, and — when the page renders questions — its
 * own FAQ block. A guide is an Article rather than a WebPage.
 */
export function landingPageSchema(input: {
  name: string;
  path: string;
  description: string;
  trail: { name: string; path: string }[];
  type?: "WebPage" | "CollectionPage" | "Article";
  updated?: string;
  faqs?: Faq[];
}) {
  const url = absoluteUrl(input.path);
  const page =
    input.type === "Article"
      ? {
          "@type": "Article",
          "@id": `${url}#article`,
          headline: input.name,
          description: input.description,
          url,
          mainEntityOfPage: url,
          ...(input.updated ? { dateModified: input.updated, datePublished: input.updated } : {}),
          author: { "@id": ORGANIZATION_ID },
          publisher: { "@id": ORGANIZATION_ID },
          isPartOf: { "@id": WEBSITE_ID },
          inLanguage: "en",
        }
      : {
          "@type": input.type ?? "WebPage",
          "@id": `${url}#webpage`,
          url,
          name: input.name,
          description: input.description,
          isPartOf: { "@id": WEBSITE_ID },
          inLanguage: "en",
        };
  return graph([breadcrumbSchema(input.trail), page, ...(input.faqs?.length ? [faqSchema(`${url}#faq`, input.faqs)] : [])]);
}
