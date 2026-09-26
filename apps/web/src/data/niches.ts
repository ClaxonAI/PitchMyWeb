import type { NicheAvailability } from "@/lib/api-client";

// The niches with a ready website template, known up front so the New
// campaign cards render instantly — before a city is picked and before the
// (paid, cached) count search answers. Mirrors NICHES in
// packages/templates/src/niches.ts, which the availability API returns; once
// that response arrives it replaces this list.

export type NicheCard = Omit<NicheAvailability, "available" | "more">;

export const NICHE_CARDS: readonly NicheCard[] = [
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

/** Which design each template's card screenshot shows (matches public/samples). */
export const SAMPLE_DESIGN: Record<string, "classic" | "studio"> = {
  "dental-clinic": "classic",
  clinic: "classic",
  restaurant: "studio",
  salon: "classic",
  gym: "studio",
  interiors: "classic",
  event: "studio",
  coaching: "classic",
};

/** Every template has these four site designs; a campaign hands them out in turn. */
export const SITE_DESIGNS = [
  { key: "classic", label: "Classic" },
  { key: "studio", label: "Studio" },
  { key: "editorial", label: "Editorial" },
  { key: "atelier", label: "Atelier" },
] as const;

/** Templates being built next, shown so customers know what is on the way. */
export const UPCOMING_NICHES = [
  "Real estate agents",
  "Hotels & homestays",
  "Law firms",
  "Car service & detailing",
  "Pet clinics & groomers",
  "Photographers",
] as const;
