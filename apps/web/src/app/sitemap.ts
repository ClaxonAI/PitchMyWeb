import type { MetadataRoute } from "next";
import { cities } from "@/data/cities";
import { guides } from "@/data/guides";
import { industries } from "@/data/industries";
import { absoluteUrl } from "@/lib/seo/site-url";

// Next builds this into a static /sitemap.xml at `next build` time.
//
// Only publicly indexable marketing pages belong here. Everything behind the
// session cookie — /dashboard, /leads, /campaigns, /websites, /whatsapp,
// /billing, /settings, /profile, /activity, /discover, /pitches and the whole
// /admin tree — is excluded, and so is /sso-callback: listing a URL in the
// sitemap while robots.txt blocks it is a Search Console error rather than a
// hint. /login and /register are left out too — a sign-in form has nothing to
// rank for; they carry noindex instead of a robots.txt block, for the reason
// robots.ts explains.

type Entry = {
  path: string;
  /**
   * The date this page's content last meaningfully changed — not the date of
   * any edit that touched the file.
   *
   * Maintained by hand, and it has to be. The obvious alternatives are both
   * wrong here:
   *
   *   - The build date moves on every deploy, which is how you teach a crawler
   *     that the field carries no information and can be ignored.
   *   - The source file's mtime looks accurate in a local build and is not.
   *     Production ships via `git archive` (docs/production-setup.md), which
   *     stamps *every* file in the tarball with the commit timestamp. This file
   *     used to stat the page source, and in production that collapsed all six
   *     entries to one identical date that moved on each deploy — the exact
   *     failure the stat was meant to avoid. Verified against the live
   *     sitemap.xml, where every lastmod read 2026-09-22T14:36:57Z, the commit
   *     time of the deployed merge.
   *   - Reading git at build time is not available: the tarball has no .git.
   *
   * So: bump the date here when you change what a page *says*. If that upkeep
   * lapses, delete the field rather than let it drift — Google's guidance is
   * that an unreliable lastmod is worse than none, because it gets the whole
   * signal discounted for the site.
   */
  lastModified: string;
};

/** Bump when the shared industry/city page copy changes (same rule as below). */
const LANDING_PAGES_UPDATED = "2026-09-25";

const ROUTES: Entry[] = [
  { path: "/", lastModified: "2026-09-23" },
  { path: "/pricing", lastModified: "2026-09-23" },
  { path: "/contact", lastModified: "2026-09-22" },
  { path: "/terms", lastModified: "2026-09-22" },
  { path: "/privacy", lastModified: "2026-09-22" },
  { path: "/refunds", lastModified: "2026-09-22" },
  { path: "/how-it-works", lastModified: "2026-09-25" },
  // The SEO landing pages: hubs, then one page per industry, city and guide,
  // generated from the same data files the pages render (data/industries.ts,
  // data/cities.ts, data/guides.ts), so a page cannot exist without its entry
  // or the other way round.
  { path: "/for", lastModified: LANDING_PAGES_UPDATED },
  { path: "/in", lastModified: LANDING_PAGES_UPDATED },
  { path: "/guides", lastModified: LANDING_PAGES_UPDATED },
  ...industries.map((industry) => ({ path: `/for/${industry.slug}`, lastModified: LANDING_PAGES_UPDATED })),
  ...cities.map((city) => ({ path: `/in/${city.slug}`, lastModified: LANDING_PAGES_UPDATED })),
  ...guides.map((guide) => ({ path: `/guides/${guide.slug}`, lastModified: guide.updated })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: route.lastModified,
  }));
}
