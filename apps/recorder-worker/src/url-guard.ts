// SSRF guard: the recorder is a headless browser, so the only URLs it may
// open are preview pages on the configured preview origin. A URL stored in
// the database is checked again here rather than trusted.

const PREVIEW_PATH = /^\/s\/[a-z0-9-]{3,80}\/?$/;

export class UrlNotAllowedError extends Error {
  constructor() {
    super("url_not_allowed");
    this.name = "UrlNotAllowedError";
  }
}

export function assertPreviewUrl(candidate: string | null | undefined, sitesPublicUrl: string): URL {
  if (!candidate) throw new UrlNotAllowedError();
  let url: URL;
  let allowed: URL;
  try {
    url = new URL(candidate);
    allowed = new URL(sitesPublicUrl);
  } catch {
    throw new UrlNotAllowedError();
  }
  const sameOrigin = url.protocol === allowed.protocol && url.host === allowed.host;
  const basePath = allowed.pathname.replace(/\/+$/, "");
  const relative = basePath && url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname;
  if (!sameOrigin || url.username || url.password || url.search || url.hash || !PREVIEW_PATH.test(relative)) {
    throw new UrlNotAllowedError();
  }
  return url;
}
