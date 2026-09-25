import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/seo/site-url";

// Next builds this into a static /robots.txt at `next build` time.

// Everything behind the session cookie. These are disallowed rather than left
// to the auth redirect because a crawler that follows them gets a redirect to
// /login and burns crawl budget on pages it can never see; blocking them keeps
// the budget on the marketing pages that can actually rank. The same set is
// excluded from sitemap.ts — keep the two in step.
const PRIVATE_PATHS = [
  "/api/",
  "/dashboard",
  "/admin",
  "/activity",
  "/billing",
  "/campaigns",
  "/discover",
  "/leads",
  "/pitches",
  "/profile",
  "/settings",
  "/websites",
  "/whatsapp",
];

// The OAuth return. It only ever carries handshake parameters and renders a
// spinner, so there is nothing for a crawler to do there.
//
// /login and /register are deliberately NOT listed. They are linked from the
// navbar, and a disallowed-but-linked URL is exactly what produces an
// "Indexed, though blocked by robots.txt" listing — a crawler that cannot
// fetch the page also cannot see a noindex on it. They carry `noindex` in
// their own metadata instead (lib/seo/metadata.ts), which is the directive
// that actually keeps them out.
const AUTH_PATHS = ["/sso-callback", "/logout"];

// A staging or preview deployment must not compete with the live domain for
// its own content. Only an explicitly non-production APP_ENV (or a localhost
// origin) triggers the block: a production deploy that simply forgot to set
// APP_ENV stays crawlable, because silently de-indexing the live site is the
// far more expensive mistake.
function isNonPublicDeploy(): boolean {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  if (appEnv && appEnv !== "production") return true;
  const { hostname } = new URL(siteUrl);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

// AI crawlers and assistants, named so the policy toward each is explicit
// rather than inherited from "*". All are welcome on the public pages — being
// read and cited by AI search and assistants is how a lot of people now find
// a product — and all get the same private-path block as everyone else.
// Grouped by what they do, as their operators document them:
const AI_AGENTS = [
  // OpenAI: training, ChatGPT search, and fetches a ChatGPT user asked for.
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic: training, Claude search, and fetches a Claude user asked for.
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  // Google Gemini / AI Overviews training control, and Apple Intelligence.
  "Google-Extended",
  "Applebot-Extended",
  // Perplexity: index and user-initiated fetches.
  "PerplexityBot",
  "Perplexity-User",
  // Microsoft Copilot runs on Bing's crawler; Meta, Amazon, Mistral, Cohere,
  // DuckDuckGo's assistant, You.com and Common Crawl (a source for many models).
  "bingbot",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "Amazonbot",
  "MistralAI-User",
  "cohere-ai",
  "DuckAssistBot",
  "YouBot",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  if (isNonPublicDeploy()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PATHS, ...AUTH_PATHS],
      },
      {
        userAgent: AI_AGENTS,
        allow: ["/", "/llms.txt"],
        disallow: [...PRIVATE_PATHS, ...AUTH_PATHS],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
