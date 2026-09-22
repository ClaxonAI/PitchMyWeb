import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo/site-url";

// Per-page metadata, built in one place so the three things that have to agree
// always do: the canonical link, og:url, and the URL the sitemap lists.
//
// The canonical deliberately is NOT set on the root layout. Next inherits
// `alternates.canonical` down the tree, so a default there would point every
// page at the same URL — which is how a site tells Google that /pricing is a
// duplicate of the home page. Each indexable page calls this instead.
//
// The openGraph block below repeats siteName/locale/type/images that the root
// layout already declares, and it has to: Next *replaces* `openGraph` wholesale
// at each segment rather than merging it. A page that set only `url` would ship
// a link card with no image and no site name — which is exactly what happened
// before this helper spelled them out. Same for `twitter`.

/** The generated card from app/opengraph-image.tsx, addressed by its route. */
const OG_IMAGE = {
  url: absoluteUrl("/opengraph-image"),
  width: 1200,
  height: 630,
  alt: "PitchMyWeb — show them the website before they ask for one",
};

type PageMetadataInput = {
  /** Site-relative path, exactly as it appears in sitemap.ts (e.g. "/pricing"). */
  path: string;
  /** Slots into the "%s · PitchMyWeb" template from the root layout. */
  title?: string;
  description?: string;
  /** Shorter line for the link card, when the meta description reads long in one. */
  socialDescription?: string;
};

export function pageMetadata({ path, title, description, socialDescription }: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  // Left undefined rather than defaulted: Next then fills og:title and
  // twitter:title from this page's own resolved <title>, which is what we want
  // everywhere. Spelling them out would only risk them drifting apart.
  const cardDescription = socialDescription ?? description;

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "PitchMyWeb",
      locale: "en_IN",
      url,
      ...(cardDescription ? { description: cardDescription } : {}),
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      ...(cardDescription ? { description: cardDescription } : {}),
      images: [OG_IMAGE],
    },
  };
}

/**
 * For pages that must never be indexed but are still reachable — sign-in
 * forms, the OAuth return. `nofollow` is left off deliberately: these pages
 * link back into the marketing site, and there is no reason to stop a crawler
 * that lands on one from following its way out.
 *
 * These pages stay crawlable in robots.txt on purpose. A crawler that is
 * blocked from fetching the page never sees this directive, and a blocked URL
 * that is linked from the navbar gets listed bare instead of dropped.
 */
export const noIndex: Metadata = {
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};
