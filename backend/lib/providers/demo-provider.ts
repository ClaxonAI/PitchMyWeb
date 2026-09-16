import type { WebsiteRequirement } from "../../generated/prisma/client";
import type { BusinessProviderInput } from "../validation/business";
import { matchesCampaignFilters } from "../campaigns/campaign-filters";

// Lead provider abstraction (backend_tasks.md section 22). The doc's
// sketch (`search(input: CampaignSearch): Promise<Business[]>`) names the
// return type as the canonical `Business`, but normalization/dedup happen
// *after* the provider call (section 44 steps 4-5), so a provider cannot
// yet produce a canonical Business — it produces the same raw, untrusted
// shape a real scraping/business-data-API provider would return. This
// documents that assumption explicitly (Rule 10) and types `search` to
// return `BusinessProviderInput[]`, the schema already validated at the
// Business-ingestion boundary (lib/validation/business.ts).
export type CampaignSearchInput = {
  location: string;
  category: string;
  radius?: number | null;
  minRating?: number | null;
  minReviews?: number | null;
  websiteRequirement: WebsiteRequirement;
  leadLimit: number;
};

export interface LeadProvider {
  search(input: CampaignSearchInput): Promise<BusinessProviderInput[]>;
}

// Fictional demo businesses only (section 21: "do not invent factual claims
// about real businesses"). Distinct externalIds from prisma/seed.ts's
// demo-00N records so a campaign run and the seed script never collide on
// the same canonical Business row purely by coincidence of id reuse; they
// still upsert against the same (source="demo") identity space, which is
// intentional — a real provider integration would work the same way.
const DEMO_BUSINESSES: BusinessProviderInput[] = [
  {
    name: "Coastal Smiles Dental",
    category: "Dental Clinic",
    address: "14 Marine Drive",
    city: "Chennai",
    phone: "+91-9811100001",
    email: "hello@coastalsmiles.example.com",
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.7,
    reviewCount: 180,
    latitude: 13.05,
    longitude: 80.28,
    source: "demo",
    externalId: "campaign-demo-001",
  },
  {
    name: "Golden Wok Kitchen",
    category: "Restaurant",
    address: "9 Church Street",
    city: "Bengaluru",
    phone: "+91-9811100002",
    email: "orders@goldenwok.example.com",
    website: "https://goldenwokkitchen.example.com",
    instagram: "https://instagram.com/goldenwok.example",
    facebook: null,
    rating: 4.1,
    reviewCount: 62,
    latitude: 12.97,
    longitude: 77.6,
    source: "demo",
    externalId: "campaign-demo-002",
  },
  {
    name: "Blush Beauty Salon",
    category: "Hair Salon",
    address: "21 Jubilee Hills Road",
    city: "Hyderabad",
    phone: "+91-9811100003",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 3.4,
    reviewCount: 4,
    latitude: 17.43,
    longitude: 78.4,
    source: "demo",
    externalId: "campaign-demo-003",
  },
  {
    name: "Torque Auto Garage",
    category: "Auto Repair",
    address: "60 Karve Road",
    city: "Pune",
    phone: null,
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 3.8,
    reviewCount: 15,
    latitude: 18.51,
    longitude: 73.84,
    source: "demo",
    externalId: "campaign-demo-004",
  },
  {
    name: "Verma & Partners Legal",
    category: "Law Firm",
    address: "3 Barakhamba Road",
    city: "Delhi",
    phone: "+91-9811100005",
    email: "contact@vermapartners.example.com",
    website: "https://vermapartners.example.com",
    instagram: null,
    facebook: "https://facebook.com/vermapartners.example",
    rating: 4.5,
    reviewCount: 95,
    latitude: 28.63,
    longitude: 77.22,
    source: "demo",
    externalId: "campaign-demo-005",
  },
  {
    name: "PeakForm Fitness Club",
    category: "Fitness Gym",
    address: "12 Linking Road",
    city: "Mumbai",
    phone: "+91-9811100006",
    email: "join@peakform.example.com",
    website: null,
    instagram: "https://instagram.com/peakform.example",
    facebook: "https://facebook.com/peakform.example",
    rating: 4.3,
    reviewCount: 51,
    latitude: 19.06,
    longitude: 72.83,
    source: "demo",
    externalId: "campaign-demo-006",
  },
  {
    name: "Little Oven Bakery",
    category: "Bakery",
    address: "5 Anna Salai",
    city: "Chennai",
    phone: "+91-9811100007",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: null,
    reviewCount: null,
    latitude: 13.06,
    longitude: 80.25,
    source: "demo",
    externalId: "campaign-demo-007",
  },
  {
    name: "Stillwater Yoga Loft",
    category: "Yoga Studio",
    address: "18 Koramangala 5th Block",
    city: "Bengaluru",
    phone: "+91-9811100008",
    email: "flow@stillwateryoga.example.com",
    website: "https://stillwateryoga.example.com",
    instagram: null,
    facebook: null,
    rating: 4.6,
    reviewCount: 73,
    latitude: 12.93,
    longitude: 77.62,
    source: "demo",
    externalId: "campaign-demo-008",
  },
  {
    name: "Anand Family Clinic",
    category: "Clinic",
    address: "27 Model Town",
    city: "Delhi",
    phone: "+91-9811100009",
    email: "info@anandclinic.example.com",
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.0,
    reviewCount: 28,
    latitude: 28.7,
    longitude: 77.19,
    source: "demo",
    externalId: "campaign-demo-009",
  },
  {
    name: "Riverside Café & Bar",
    category: "Cafe",
    address: "8 FC Road",
    city: "Pune",
    phone: "+91-9811100010",
    email: "hi@riversidecafe.example.com",
    website: null,
    instagram: "https://instagram.com/riversidecafe.example",
    facebook: null,
    rating: 4.4,
    reviewCount: 33,
    latitude: 18.52,
    longitude: 73.85,
    source: "demo",
    externalId: "campaign-demo-010",
  },
];

/**
 * V1 seeded/demo provider (section 21/22): lets the complete campaign-run
 * path be tested without external API keys. Filtering (category/location/
 * rating/reviews/website requirement) is delegated to the single shared
 * matchesCampaignFilters() predicate (lib/campaigns/campaign-filters.ts) —
 * representing a real provider's own server-side filtering — rather than
 * duplicating that logic here.
 *
 * Deliberately does NOT slice results to `leadLimit` (Phase 4 follow-up,
 * section 10): leadLimit governs how many leads campaign execution
 * ultimately *creates* from the eligible, deduplicated candidates, not how
 * many raw candidates a provider is allowed to return. Slicing here would
 * let a handful of duplicate/failing businesses among the first N silently
 * starve the campaign of leads it could have reached using the remaining
 * matches — the caller (run.service.ts) is responsible for the leadLimit
 * cutoff. `leadLimit` is still accepted on the input for interface
 * completeness (a real, paginated provider would use it as a fetch-size
 * hint), it's just not applied as a hard slice by this in-memory provider.
 */
export class DemoProvider implements LeadProvider {
  async search(input: CampaignSearchInput): Promise<BusinessProviderInput[]> {
    return DEMO_BUSINESSES.filter((business) => matchesCampaignFilters(business, input));
  }
}
