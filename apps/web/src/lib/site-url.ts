// The canonical origin for this deployment. Page metadata, robots.txt and the
// sitemap all have to agree on it or they contradict each other, and they are
// generated in three separate places, so it is derived from APP_URL once here
// rather than re-read in each of them. Any trailing slash is stripped so
// callers can always append a path without doubling up.
export const SITE_URL = (process.env.APP_URL?.trim() || "https://pitchmyweb.in").replace(/\/+$/, "");
