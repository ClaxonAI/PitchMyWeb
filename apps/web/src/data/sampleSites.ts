import type { SampleSite } from "@/types";

/** Featured marketing samples — each maps to a real apps/sites demo template. */
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
  },
];

export const SITES_PUBLIC_URL =
  process.env.NEXT_PUBLIC_SITES_URL?.replace(/\/$/, "") ?? "http://localhost:3200";

export function sampleDemoUrl(template: string, embed = false) {
  return `${SITES_PUBLIC_URL}/demo/${template}${embed ? "?embed=1" : ""}`;
}
