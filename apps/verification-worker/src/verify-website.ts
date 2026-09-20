import type { Browser } from "playwright";
import { ssrfSafeFetch, SsrfSafeFetchError, type SsrfSafeFetchOptions } from "./ssrf-safe-fetch.js";

// HTTP-first, Playwright-escalation website-liveness check (Phase 2C).
// Never gates lead/campaign creation — this only ever runs after a Business
// row already exists, on a rolling schedule (see process-verification.ts).

export type VerificationStatus = "UNVERIFIED" | "LIVE" | "PARKED" | "DEAD" | "UNREACHABLE";

// A short, explicit list of known registrar parking/for-sale page signals —
// deliberately not a fuzzy classifier. False positives (a real business page
// that happens to mention "domain") are rare with phrases this specific, and
// any match still only *escalates* to a rendered Playwright check rather
// than committing straight to PARKED.
const PARKED_PAGE_SIGNALS = [
  "domain is for sale",
  "buy this domain",
  "this domain is parked",
  "future home of",
  "godaddy.com/domains",
  "namecheap.com/domains",
  "sedo.com",
  "hugedomains.com",
  "dan.com",
  "parkingcrew",
  "bodis.com",
  "this web page is parked",
];

// A rendered page with less than this much visible text is treated as a
// second parked-page fingerprint (most parking pages render almost nothing
// beyond a registrar banner/ad).
const NEAR_EMPTY_RENDERED_TEXT_LENGTH = 40;

function hasParkedSignal(body: string): boolean {
  const haystack = body.slice(0, 50_000).toLowerCase();
  return PARKED_PAGE_SIGNALS.some((signal) => haystack.includes(signal));
}

export type VerifyWebsiteOptions = {
  browser: Browser;
  httpTimeoutMs?: number;
  playwrightTimeoutMs?: number;
  fetchOptions?: SsrfSafeFetchOptions;
};

export async function verifyWebsite(website: string, options: VerifyWebsiteOptions): Promise<VerificationStatus> {
  let url: URL;
  try {
    url = new URL(website);
  } catch {
    return "DEAD";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "DEAD";

  const httpTimeoutMs = options.httpTimeoutMs ?? 8_000;

  let response;
  try {
    response = await ssrfSafeFetch(url.toString(), { method: "HEAD", timeoutMs: httpTimeoutMs, ...options.fetchOptions });
  } catch (error) {
    if (error instanceof SsrfSafeFetchError && error.reason === "timeout") return "UNREACHABLE";
    // A HEAD rejection (405/501, or some servers just refuse it) still might
    // be a live site — retry once with GET before giving up on this hop.
    try {
      response = await ssrfSafeFetch(url.toString(), { method: "GET", timeoutMs: httpTimeoutMs, ...options.fetchOptions });
    } catch (getError) {
      if (getError instanceof SsrfSafeFetchError && getError.reason === "timeout") return "UNREACHABLE";
      return "DEAD";
    }
  }

  if (response.status < 200 || response.status >= 300) {
    // A non-2xx after a successful HEAD is still worth one GET retry — some
    // sites 405/501 on HEAD specifically rather than failing generally.
    if (response.status === 405 || response.status === 501) {
      try {
        response = await ssrfSafeFetch(url.toString(), { method: "GET", timeoutMs: httpTimeoutMs, ...options.fetchOptions });
        if (response.status < 200 || response.status >= 300) return "DEAD";
      } catch {
        return "DEAD";
      }
    } else {
      return "DEAD";
    }
  }

  if (!hasParkedSignal(response.body)) return "LIVE";

  // Ambiguous: raw HTML matched a parked-page signal. Escalate to a real
  // render before committing — a JS-heavy real business site could
  // conceivably mention one of these phrases in passing (e.g. an FAQ about
  // domain names), and rendering resolves that in the business's favor.
  return verifyWithPlaywright(url.toString(), options.browser, options.playwrightTimeoutMs ?? 10_000);
}

async function verifyWithPlaywright(url: string, browser: Browser, timeoutMs: number): Promise<VerificationStatus> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    } catch {
      // The HTTP layer already proved this host reachable once — a
      // Playwright navigation failure here is inconclusive, not proof of
      // death.
      return "UNREACHABLE";
    }
    if (!response || !response.ok()) return "UNREACHABLE";

    const renderedText = (await page.evaluate(() => document.body?.innerText ?? "")).trim();
    const renderedHtml = await page.content();
    if (hasParkedSignal(renderedHtml) || renderedText.length < NEAR_EMPTY_RENDERED_TEXT_LENGTH) return "PARKED";
    return "LIVE";
  } finally {
    await context.close().catch(() => undefined);
  }
}
