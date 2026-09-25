import { cities } from "@/data/cities";
import { guides } from "@/data/guides";
import { industries } from "@/data/industries";
import { plans } from "@/data/plans";
import { absoluteUrl } from "@/lib/seo/site-url";

// /llms.txt (llmstxt.org): a plain-Markdown map of the site for AI assistants
// and answer engines, so a model asked about PitchMyWeb reads a summary from
// us rather than guessing from fragments. Built from the same data files as
// the pages and the sitemap, so the three never disagree. Static at build time.

export const dynamic = "force-static";

function link(label: string, path: string, note?: string): string {
  return `- [${label}](${absoluteUrl(path)})${note ? `: ${note}` : ""}`;
}

export function GET(): Response {
  const priceLines = plans.map((plan) => {
    const india = plan.prices.find((price) => price.market === "india");
    return `- ${plan.name}: ${plan.batchSize} ${plan.unitLabel}${india ? ` for ₹${india.amount}` : ""}. ${plan.summary}`;
  });

  const body = [
    "# PitchMyWeb",
    "",
    "> PitchMyWeb finds local businesses that have no website, builds each one a real sample website and a short demo video (phone and laptop views), and pitches it to the owner from the user's own WhatsApp. It is for freelancers, web designers and agencies who sell websites to small businesses.",
    "",
    "Searching for businesses is free; pitches are bought in batches. On the Auto plan the user links WhatsApp for each campaign and is signed out when it finishes; on the Direct plan they get one-tap wa.me links to send themselves. Numbers not on WhatsApp are replaced with the next lead instead of wasting the credit.",
    "",
    "## Plans",
    ...priceLines,
    link("Pricing", "/pricing"),
    "",
    "## Product",
    link("Home", "/"),
    link("How it works", "/how-it-works"),
    link("Contact", "/contact"),
    "",
    "## Industries",
    ...industries.map((industry) => link(industry.name, `/for/${industry.slug}`, industry.pitchAngle)),
    "",
    "## Cities",
    ...cities.map((city) => link(`${city.name}, ${city.state}`, `/in/${city.slug}`)),
    "",
    "## Guides",
    ...guides.map((guide) => link(guide.title, `/guides/${guide.slug}`, guide.description)),
    "",
    "## Policies",
    link("Terms", "/terms"),
    link("Privacy", "/privacy"),
    link("Refunds", "/refunds"),
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
