import { statSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site-url";

// Next builds this into a static /sitemap.xml at `next build` time.
//
// Only publicly indexable marketing pages belong here. Everything behind the
// session cookie — /dashboard, /leads, /campaigns, /websites, /whatsapp,
// /billing, /settings, /profile, /activity, /discover, /pitches and the whole
// /admin tree — is excluded, and so are /login, /register and /sso-callback:
// a sign-in form has nothing to rank for, and listing a URL in the sitemap
// while robots.txt blocks it is a Search Console error rather than a hint.
// Keep this list in step with robots.ts, which disallows the same set.

type Entry = {
  path: string;
  /** Source file, so lastModified reflects a real content change. */
  source: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

const ROUTES: Entry[] = [
  { path: "/", source: "(marketing)/page.tsx", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", source: "(marketing)/pricing/page.tsx", changeFrequency: "weekly", priority: 0.9 },
  { path: "/contact", source: "(marketing)/contact/page.tsx", changeFrequency: "monthly", priority: 0.6 },
  { path: "/terms", source: "(marketing)/terms/page.tsx", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", source: "(marketing)/privacy/page.tsx", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refunds", source: "(marketing)/refunds/page.tsx", changeFrequency: "yearly", priority: 0.3 },
];

// A lastModified that moves on every deploy teaches crawlers to ignore the
// field, so it is taken from the page's own source file. The build runs with
// the sources present (this module is evaluated during `next build`), but the
// fallback keeps a sitemap being emitted rather than a build failing if a
// future packaging step moves them.
const buildTime = new Date();
function lastModified(source: string): Date {
  try {
    return statSync(path.join(process.cwd(), "src", "app", source)).mtime;
  } catch {
    return buildTime;
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: lastModified(route.source),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
