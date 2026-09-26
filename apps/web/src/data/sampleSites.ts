import type { SampleSite } from "@/types";

/**
 * Featured marketing samples — each maps to a real apps/sites demo, in one of
 * its two designs. The first three also drive the hand-drawn previews in the
 * hero and "how it works" sections, so keep their order.
 */
export const sampleSites: SampleSite[] = [
  {
    template: "restaurant",
    domain: "morrowcoffee.in",
    name: "Morrow",
    category: "Specialty café",
    city: "Chennai",
    tagline: "A table worth booking in Chennai",
    cta: "Reserve on WhatsApp",
    theme: { bg: "#f7f1e6", fg: "#2a1c12", accent: "#9a4a16", muted: "#f3e0cc" },
    layout: "split",
    design: "studio",
  },
  {
    template: "salon",
    domain: "houseofnira.com",
    name: "House of Nira",
    category: "Hair & skin studio",
    city: "Bengaluru",
    tagline: "Hair, beauty and care in Bengaluru",
    cta: "Book on WhatsApp",
    theme: { bg: "#f6f3fb", fg: "#17131f", accent: "#7c3aed", muted: "#f5f3ff" },
    layout: "centered",
    design: "classic",
  },
  {
    template: "dental-clinic",
    domain: "northstardental.ae",
    name: "Northstar Dental",
    category: "Family dentistry",
    city: "Dubai",
    tagline: "Everyday care and specialist treatment",
    cta: "Book on WhatsApp",
    theme: { bg: "#f6f2ea", fg: "#10292c", accent: "#0f5c57", muted: "#dcebe6" },
    layout: "editorial",
    design: "classic",
  },
  {
    template: "gym",
    domain: "ironlinegym.co.uk",
    name: "Ironline",
    category: "Strength gym",
    city: "Leeds",
    tagline: "Train at your pace in Leeds",
    cta: "Book on WhatsApp",
    theme: { bg: "#111111", fg: "#f4f1ea", accent: "#ff7a00", muted: "#3a2414" },
    layout: "split",
    design: "studio",
  },
  {
    template: "event",
    domain: "dayofbloom.in",
    name: "Day of Bloom",
    category: "Event planner",
    city: "Jaipur",
    tagline: "Events planned in Jaipur",
    cta: "Enquire on WhatsApp",
    theme: { bg: "#1b1718", fg: "#f0ded0", accent: "#c9a35c", muted: "#321426" },
    layout: "editorial",
    design: "studio",
  },
  {
    template: "coaching",
    domain: "brightpath.academy",
    name: "BrightPath",
    category: "Coaching centre",
    city: "Kochi",
    tagline: "Teaching that fits Kochi",
    cta: "Enquire on WhatsApp",
    theme: { bg: "#eef2f6", fg: "#0f1720", accent: "#1e3a5f", muted: "#d9e4f0" },
    layout: "centered",
    design: "classic",
  },
];

export const SITES_PUBLIC_URL =
  process.env.NEXT_PUBLIC_SITES_URL?.replace(/\/$/, "") ?? "http://localhost:3200";

export function sampleDemoUrl(site: Pick<SampleSite, "template" | "design">, embed = false) {
  const query = new URLSearchParams();
  if (site.design !== "classic") query.set("design", site.design);
  if (embed) query.set("embed", "1");
  const search = query.toString();
  return `${SITES_PUBLIC_URL}/demo/${site.template}${search ? `?${search}` : ""}`;
}

/**
 * Static screenshot of the demo, shown instead of a live iframe: a live
 * preview loads a whole site (scripts, fonts, map) per card, which is most of
 * the page weight on a phone. Regenerate with scripts/capture-sample-previews.mts.
 */
export function samplePreviewImage(site: Pick<SampleSite, "template" | "design">) {
  return `/samples/${site.template}-${site.design}.webp`;
}
