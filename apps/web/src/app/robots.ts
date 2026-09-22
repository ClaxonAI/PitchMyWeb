import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// Note what is NOT disallowed here. The signed-in app and the auth pages stay
// crawlable on purpose and carry `robots: { index: false }` in their layouts
// instead. The two are not interchangeable: a crawler blocked in robots.txt
// never fetches the page, so it never sees the noindex, and the bare URL can
// still be listed off the back of an inbound link. Blocking is for things that
// must not be *requested*; noindex is for things that must not be *listed*.
// Only /api/ qualifies for the former.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
