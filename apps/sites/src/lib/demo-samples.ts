import {
  buildPreviewContent,
  isPreviewTemplate,
  type DentalContent,
  type PreviewDesign,
  type PreviewTemplateCode,
} from "@pitchmyweb/templates";

export type DemoSample = {
  template: PreviewTemplateCode;
  domain: string;
  category: string;
  city: string;
  name: string;
  phone?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
};

/** Marketing demos — one fixed example per preview vertical. */
export const DEMO_SAMPLES: Record<PreviewTemplateCode, DemoSample> = {
  "dental-clinic": {
    template: "dental-clinic",
    domain: "northstardental.ae",
    name: "Northstar Dental",
    category: "Family dentistry",
    city: "Dubai",
    phone: "+971 4 555 0192",
    address: "Al Wasl Road, Jumeirah, Dubai",
    rating: 4.9,
    reviewCount: 214,
  },
  clinic: {
    template: "clinic",
    domain: "carepointclinic.in",
    name: "CarePoint Clinic",
    category: "General clinic",
    city: "Hyderabad",
    phone: "+91 40 4000 2211",
    address: "Banjara Hills Road No. 12, Hyderabad",
    rating: 4.7,
    reviewCount: 96,
  },
  restaurant: {
    template: "restaurant",
    domain: "morrowcoffee.in",
    name: "Morrow",
    category: "Specialty café",
    city: "Chennai",
    phone: "+91 44 4500 1188",
    address: "4th Avenue, Besant Nagar, Chennai",
    rating: 4.8,
    reviewCount: 312,
  },
  salon: {
    template: "salon",
    domain: "houseofnira.com",
    name: "House of Nira",
    category: "Hair & skin studio",
    city: "Bengaluru",
    phone: "+91 80 4120 7788",
    address: "Indiranagar 100 Feet Road, Bengaluru",
    rating: 4.9,
    reviewCount: 188,
  },
  gym: {
    template: "gym",
    domain: "ironlinegym.co.uk",
    name: "Ironline",
    category: "Strength gym",
    city: "Leeds",
    phone: "+44 113 496 0123",
    address: "Kirkstall Road, Leeds",
    rating: 4.6,
    reviewCount: 141,
  },
  interiors: {
    template: "interiors",
    domain: "atelierline.studio",
    name: "Atelier Line",
    category: "Interior studio",
    city: "Pune",
    phone: "+91 20 2600 4411",
    address: "Koregaon Park, Pune",
    rating: 4.8,
    reviewCount: 67,
  },
  event: {
    template: "event",
    domain: "dayofbloom.in",
    name: "Day of Bloom",
    category: "Event planner",
    city: "Jaipur",
    phone: "+91 141 400 2299",
    address: "C-Scheme, Jaipur",
    rating: 4.9,
    reviewCount: 52,
  },
  coaching: {
    template: "coaching",
    domain: "brightpath.academy",
    name: "BrightPath",
    category: "Coaching centre",
    city: "Kochi",
    phone: "+91 484 401 3300",
    address: "Panampilly Nagar, Kochi",
    rating: 4.7,
    reviewCount: 203,
  },
};

export function getDemoSample(template: string): DemoSample | null {
  if (!isPreviewTemplate(template)) return null;
  return DEMO_SAMPLES[template];
}

export function buildDemoContent(template: PreviewTemplateCode, design: PreviewDesign = "classic"): DentalContent {
  const sample = DEMO_SAMPLES[template];
  return buildPreviewContent(
    {
      name: sample.name,
      category: sample.category,
      city: sample.city,
      phone: sample.phone,
      address: sample.address,
      rating: sample.rating,
      reviewCount: sample.reviewCount,
    },
    {},
    { template, design, now: new Date("2026-01-15T10:00:00.000Z") },
  );
}
