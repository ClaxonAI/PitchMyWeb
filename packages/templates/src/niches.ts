import type { PreviewTemplateCode } from "./dental";

// The niches PitchMyWeb has a ready-made website template for: what the New
// campaign screen offers as one-tap cards, and what availability is counted
// for. `category` is the search phrase sent to Google Maps ("<category> in
// <city>") and becomes the campaign's category, so pickPreviewTemplate
// (verticals.ts) must map it to `template` — niches.test.ts checks that.

export type Niche = {
  slug: string;
  /** Plural, as shown on the card: "Dental clinics". */
  label: string;
  /** The search phrase and campaign category. */
  category: string;
  template: PreviewTemplateCode;
};

export const NICHES: readonly Niche[] = [
  { slug: "dental-clinics", label: "Dental clinics", category: "Dental Clinic", template: "dental-clinic" },
  { slug: "clinics", label: "Clinics & doctors", category: "Clinic", template: "clinic" },
  { slug: "physiotherapy", label: "Physiotherapy", category: "Physiotherapy Clinic", template: "clinic" },
  { slug: "restaurants", label: "Restaurants", category: "Restaurant", template: "restaurant" },
  { slug: "cafes", label: "Cafés", category: "Cafe", template: "restaurant" },
  { slug: "bakeries", label: "Bakeries", category: "Bakery", template: "restaurant" },
  { slug: "salons", label: "Salons", category: "Salon", template: "salon" },
  { slug: "beauty-parlours", label: "Beauty parlours", category: "Beauty Parlour", template: "salon" },
  { slug: "spas", label: "Spas", category: "Spa", template: "salon" },
  { slug: "gyms", label: "Gyms", category: "Gym", template: "gym" },
  { slug: "yoga-studios", label: "Yoga studios", category: "Yoga Studio", template: "gym" },
  { slug: "interior-designers", label: "Interior designers", category: "Interior Designer", template: "interiors" },
  { slug: "event-planners", label: "Event planners", category: "Event Planner", template: "event" },
  { slug: "coaching-centres", label: "Coaching centres", category: "Coaching Centre", template: "coaching" },
];

export function findNiche(slug: string): Niche | undefined {
  return NICHES.find((niche) => niche.slug === slug);
}
