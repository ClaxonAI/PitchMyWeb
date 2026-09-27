import type { MetadataRoute } from "next";

// Preview sites are never indexable. A preview is a sales concept built for a
// business that has not agreed to it yet — not that business's official site —
// so it must not surface in search results under their name.
//
// The X-Robots-Tag header in next.config.ts and the noindex in layout.tsx both
// already say so, but both only work once a crawler has fetched the page. This
// stops the fetch happening at all, which also keeps /s/[slug] previews (and
// the API calls behind them) out of crawler traffic entirely.
//
// /demo/ is the exception: the marketing site links to those sample designs,
// and a linked URL that crawlers may not fetch can still be listed as
// "indexed, though blocked" — they must see the noindex to drop it.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/demo/", disallow: "/" }] };
}
