import { faqs } from "@/data/faq";
import { siteConfig } from "@/data/site";
import { SITE_URL } from "@/lib/site-url";

// One @graph rather than three separate <script> blocks, so the Organization
// can be referenced by @id from the other nodes instead of being repeated.
//
// Deliberately absent: any Review, AggregateRating or Offer node. The
// testimonials on the page carry no verifiable ratings and the plan prices
// vary by country, and inventing either to win a rich result is exactly the
// kind of thing that earns a structured-data manual action.
export function landingPageGraph() {
  const orgId = `${SITE_URL}/#organization`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: siteConfig.name,
        url: SITE_URL,
        email: siteConfig.email,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo.webp` },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: siteConfig.name,
        publisher: { "@id": orgId },
        // No potentialAction/SearchAction: the site has no search endpoint,
        // and claiming one that 404s is worse than claiming nothing.
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };
}
