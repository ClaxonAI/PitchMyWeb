// Industry landing pages (/for/[slug]). One entry per kind of local business
// PitchMyWeb finds and pitches. `template` names the sample-site design the
// pitch is built on (packages/templates pickPreviewTemplate) — keep it in step
// with that mapping so a page never promises a design the builder won't use.
//
// Copy rule: say what the product does for this trade and why a site matters
// to its customers. No invented statistics.

export type Industry = {
  slug: string;
  /** Plural, as a search would phrase it: "dental clinics". */
  name: string;
  /** Singular, for sentences: "a dental clinic". */
  singular: string;
  /** Short description of the sample site's template. */
  template: "dental-clinic" | "clinic" | "restaurant" | "salon" | "gym" | "interiors" | "event" | "coaching";
  /** Why this trade's customers look for a website before they call. */
  why: string;
  /** What the sample site shows for this trade. */
  siteSections: string[];
  /** The line the pitch opens with, in the owner's terms. */
  pitchAngle: string;
  /** Categories to type into Discover for this trade. */
  searchTerms: string[];
};

export const industries: Industry[] = [
  {
    slug: "dental-clinics",
    name: "Dental clinics",
    singular: "a dental clinic",
    template: "dental-clinic",
    why: "Patients compare clinics before they book: treatments offered, timings, how to reach the chair. A clinic with only a map listing loses that comparison to the one next door with a page.",
    siteSections: ["Treatments, from check-ups to implants and braces", "Clinic timings and a map", "Booking on WhatsApp in one tap", "Answers to first-visit questions"],
    pitchAngle: "Show the dentist their clinic with a booking button already on it.",
    searchTerms: ["Dental Clinic", "Dentist", "Orthodontist"],
  },
  {
    slug: "clinics-and-doctors",
    name: "Clinics and doctors",
    singular: "a clinic",
    template: "clinic",
    why: "People search for a doctor near them and pick the one whose specialities and timings they can see at a glance. A listing without a site leaves those questions to a phone call many never make.",
    siteSections: ["Specialities and services", "Consultation timings", "Appointment requests on WhatsApp", "Directions and contact"],
    pitchAngle: "Show the doctor a page that answers the questions their front desk hears all day.",
    searchTerms: ["Clinic", "Doctor", "Pediatrician", "Dermatologist"],
  },
  {
    slug: "physiotherapy-clinics",
    name: "Physiotherapy clinics",
    singular: "a physiotherapy clinic",
    template: "clinic",
    why: "Patients referred for physio usually choose a clinic by distance and by whether it treats their problem. A site that lists conditions treated wins that choice.",
    siteSections: ["Conditions treated and therapies offered", "Session timings", "Booking on WhatsApp", "Location and parking notes"],
    pitchAngle: "Show the physio a page patients can find straight after their referral.",
    searchTerms: ["Physiotherapy", "Physiotherapist", "Physio Clinic"],
  },
  {
    slug: "restaurants",
    name: "Restaurants",
    singular: "a restaurant",
    template: "restaurant",
    why: "Diners check the menu, the vibe and the hours before they decide where to eat. Without a site, the restaurant depends entirely on delivery apps that take a cut of every order.",
    siteSections: ["Signature dishes and the menu", "Opening hours", "Table reservations on WhatsApp", "Directions"],
    pitchAngle: "Show the owner a page that takes table bookings without an aggregator in the middle.",
    searchTerms: ["Restaurant", "Family Restaurant", "Dhaba"],
  },
  {
    slug: "cafes",
    name: "Cafés",
    singular: "a café",
    template: "restaurant",
    why: "A café sells an atmosphere as much as a menu. A page with the space, the hours and the specials is what turns a search into a visit.",
    siteSections: ["The space and the menu", "Hours", "Reservations or enquiries on WhatsApp", "How to get there"],
    pitchAngle: "Show the café owner their place looking the way regulars describe it.",
    searchTerms: ["Cafe", "Coffee Shop", "Tea House"],
  },
  {
    slug: "bakeries",
    name: "Bakeries",
    singular: "a bakery",
    template: "restaurant",
    why: "Custom cakes and bulk orders start with a search. A bakery with a page that shows its range and takes orders on WhatsApp gets the order before the customer scrolls on.",
    siteSections: ["Cakes, breads and specials", "Custom-order enquiries on WhatsApp", "Timings", "Pickup location"],
    pitchAngle: "Show the baker a page that takes custom-cake orders on WhatsApp.",
    searchTerms: ["Bakery", "Cake Shop", "Patisserie"],
  },
  {
    slug: "cloud-kitchens",
    name: "Cloud kitchens",
    singular: "a cloud kitchen",
    template: "restaurant",
    why: "A kitchen with no storefront lives or dies on being findable. Its own page lets repeat customers order directly instead of through an app commission.",
    siteSections: ["The menu", "Direct orders on WhatsApp", "Delivery areas and hours", "Contact"],
    pitchAngle: "Show the kitchen a way to take repeat orders without the app commission.",
    searchTerms: ["Cloud Kitchen", "Home Kitchen", "Tiffin Service"],
  },
  {
    slug: "salons",
    name: "Salons",
    singular: "a salon",
    template: "salon",
    why: "Clients choose a salon by its services, its prices and how easy it is to book. A salon that makes them call during business hours loses the ones browsing at night.",
    siteSections: ["Hair, skin and grooming services", "Booking on WhatsApp", "Timings", "Location"],
    pitchAngle: "Show the salon owner a page that books appointments while they are busy with a client.",
    searchTerms: ["Salon", "Hair Salon", "Unisex Salon"],
  },
  {
    slug: "beauty-parlours",
    name: "Beauty parlours",
    singular: "a beauty parlour",
    template: "salon",
    why: "Bridal and occasion bookings are researched weeks ahead. A parlour with a page showing its services is on the shortlist; one without is not.",
    siteSections: ["Beauty and bridal services", "Enquiries on WhatsApp", "Timings", "Directions"],
    pitchAngle: "Show the parlour a page that gets it onto a bride's shortlist.",
    searchTerms: ["Beauty Parlour", "Bridal Makeup", "Beauty Salon"],
  },
  {
    slug: "spas",
    name: "Spas",
    singular: "a spa",
    template: "salon",
    why: "Spa customers want to see the treatments and feel of the place before they book. A clear page builds the trust a map pin cannot.",
    siteSections: ["Treatments and packages", "Booking on WhatsApp", "Timings", "Location"],
    pitchAngle: "Show the spa its treatments laid out the way a first-time guest wants to read them.",
    searchTerms: ["Spa", "Massage Center", "Wellness Spa"],
  },
  {
    slug: "barbershops",
    name: "Barbershops",
    singular: "a barbershop",
    template: "salon",
    why: "A barbershop's regulars walk in, but new customers search first. A page with services, prices and a way to book fills the quiet hours.",
    siteSections: ["Cuts, shaves and grooming", "Booking on WhatsApp", "Hours", "Directions"],
    pitchAngle: "Show the barber a page that fills the quiet hours with bookings.",
    searchTerms: ["Barber Shop", "Men's Salon", "Grooming Lounge"],
  },
  {
    slug: "gyms",
    name: "Gyms and fitness studios",
    singular: "a gym",
    template: "gym",
    why: "People join the gym they can picture themselves in. Programs, timings and a trial-session button do the selling that a listing cannot.",
    siteSections: ["Programs and training", "Timings", "Free-trial enquiries on WhatsApp", "Location"],
    pitchAngle: "Show the gym owner a page that books trial sessions.",
    searchTerms: ["Gym", "Fitness Center", "CrossFit"],
  },
  {
    slug: "yoga-studios",
    name: "Yoga studios",
    singular: "a yoga studio",
    template: "gym",
    why: "Students pick a studio by its style, its batch timings and its teacher. A page that lays those out converts searchers into first classes.",
    siteSections: ["Styles and batches", "Class timings", "Trial class on WhatsApp", "Studio location"],
    pitchAngle: "Show the studio its batches and timings on one page with a trial-class button.",
    searchTerms: ["Yoga Studio", "Yoga Classes", "Pilates Studio"],
  },
  {
    slug: "interior-designers",
    name: "Interior designers",
    singular: "an interior designer",
    template: "interiors",
    why: "Interior projects are large decisions made after a lot of browsing. A designer without a page is invisible during exactly the weeks a client is choosing.",
    siteSections: ["Services, from modular kitchens to full homes", "How a project runs", "Consultation requests on WhatsApp", "Studio location"],
    pitchAngle: "Show the designer a studio page to send prospects to.",
    searchTerms: ["Interior Designer", "Modular Kitchen", "Architect"],
  },
  {
    slug: "event-planners",
    name: "Event and wedding planners",
    singular: "an event planner",
    template: "event",
    why: "Couples and companies shortlist planners online months before the date. A page with services and an enquiry button is the price of being considered.",
    siteSections: ["Weddings, parties and corporate events", "How planning works", "Enquiries on WhatsApp", "Contact"],
    pitchAngle: "Show the planner a page that turns searches into date enquiries.",
    searchTerms: ["Event Planner", "Wedding Planner", "Banquet Hall"],
  },
  {
    slug: "coaching-centres",
    name: "Coaching centres and tutors",
    singular: "a coaching centre",
    template: "coaching",
    why: "Parents compare courses, batches and results before admissions. A centre with a page answers those questions before the parent calls someone else.",
    siteSections: ["Courses and batches", "Admission enquiries on WhatsApp", "Timings", "Centre location"],
    pitchAngle: "Show the institute a page parents can read before admissions open.",
    searchTerms: ["Coaching Centre", "Tuition Classes", "Academy"],
  },
];

export const templateLabel: Record<Industry["template"], string> = {
  "dental-clinic": "dental clinic",
  clinic: "clinic",
  restaurant: "restaurant and café",
  salon: "salon and beauty",
  gym: "gym and fitness",
  interiors: "interiors studio",
  event: "events",
  coaching: "coaching and education",
};

export function findIndustry(slug: string): Industry | undefined {
  return industries.find((industry) => industry.slug === slug);
}
