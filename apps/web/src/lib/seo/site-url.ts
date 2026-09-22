// The one place that decides what origin this deployment calls itself by.
//
// It feeds three things that must never disagree: metadataBase (which turns
// every relative og:image and canonical into an absolute URL), sitemap.xml,
// and robots.txt. A sitemap whose <loc> origin differs from the canonical tag
// on the page it points at is the classic way to make Google drop the URL as
// a duplicate, so they read from here rather than each hardcoding a domain.
//
// APP_URL is the same variable the API and apps/sites already read for the
// deployment's public origin (see docs/production-setup.md); the fallback is
// the live domain so a build with the variable unset still emits correct
// absolute URLs rather than localhost ones.
const FALLBACK_ORIGIN = "https://pitchmyweb.in";

function resolveOrigin(): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) return FALLBACK_ORIGIN;
  try {
    // Normalised to origin only: a trailing slash or stray path in the
    // environment would otherwise show up doubled in every sitemap entry.
    return new URL(configured).origin;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

export const siteUrl = resolveOrigin();

/** Absolute URL for a site-relative path, e.g. absoluteUrl("/pricing"). */
export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl).toString();
}
