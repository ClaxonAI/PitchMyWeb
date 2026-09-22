import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// Only pages that are public, indexable, and canonical in their own right.
// The dashboard, admin and auth routes are deliberately absent: they are
// noindex, and listing a noindex URL in a sitemap is a contradictory signal
// that Search Console reports back as an error. The landing page's sections
// (/#how, /#samples, /#faq) are absent too -- they are fragments of a page
// already listed, not separate documents.
const routes = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refunds", changeFrequency: "yearly", priority: 0.3 },
] as const satisfies readonly { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[];

export default function sitemap(): MetadataRoute.Sitemap {
  // These pages are statically prerendered, so the build is genuinely the last
  // point at which any of them could have changed.
  const lastModified = new Date();
  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
