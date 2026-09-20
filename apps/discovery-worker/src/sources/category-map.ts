// Maps the app's existing seed categories (apps/web's own marketing copy —
// "Cafés · Salons · Dental clinics · Gyms · Bakeries · Boutiques ·
// Restaurants · Tutors · Photographers · Florists · Car detailers · Yoga
// studios") to their OpenStreetMap tag equivalents. Deliberately a small,
// fixed table, not a general free-text-category classifier — that's
// Phase 2D's problem (the NL query parser). A campaign category that isn't
// in this table falls back to a generic "name contains the category word"
// search (searchCategoryFallback below), which is far weaker but at least
// doesn't return nothing.
export type OsmTag = { key: string; value: string };

const CATEGORY_TAGS: Record<string, OsmTag[]> = {
  "dental clinic": [{ key: "amenity", value: "dentist" }],
  gym: [{ key: "leisure", value: "fitness_centre" }],
  bakery: [{ key: "shop", value: "bakery" }],
  boutique: [{ key: "shop", value: "boutique" }],
  restaurant: [{ key: "amenity", value: "restaurant" }],
  // OSM has no clean tag for "tutor" specifically; language_school is the
  // closest commonly-used approximation and will under-match.
  tutor: [{ key: "amenity", value: "language_school" }],
  photographer: [
    { key: "shop", value: "photo" },
    { key: "craft", value: "photographer" },
  ],
  florist: [{ key: "shop", value: "florist" }],
  cafe: [{ key: "amenity", value: "cafe" }],
  salon: [{ key: "shop", value: "hairdresser" }],
  "car detailer": [{ key: "shop", value: "car_repair" }],
  // Same caveat as tutor — fitness_centre is reused since OSM has no
  // dedicated "yoga studio" tag; results will include general gyms too.
  "yoga studio": [{ key: "leisure", value: "fitness_centre" }],
};

/** Case/whitespace-insensitive lookup; also tries a naive singular form ("dental clinics" -> "dental clinic"). */
export function tagsForCategory(category: string): OsmTag[] | null {
  const normalized = category.trim().toLowerCase();
  if (CATEGORY_TAGS[normalized]) return CATEGORY_TAGS[normalized];
  const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
  return CATEGORY_TAGS[singular] ?? null;
}
