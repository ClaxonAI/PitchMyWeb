// City landing pages (/in/[slug]). Cities where PitchMyWeb's discovery can
// search for businesses without a website. Facts here are limited to what is
// not in dispute (the state, the city's name); nothing is claimed about how
// many businesses there lack a site.

export type City = {
  slug: string;
  name: string;
  state: string;
  /** Local trades worth searching first in this city (industry slugs). */
  focus: string[];
};

export const cities: City[] = [
  { slug: "chennai", name: "Chennai", state: "Tamil Nadu", focus: ["dental-clinics", "restaurants", "coaching-centres"] },
  { slug: "bengaluru", name: "Bengaluru", state: "Karnataka", focus: ["cafes", "gyms", "interior-designers"] },
  { slug: "mumbai", name: "Mumbai", state: "Maharashtra", focus: ["salons", "cloud-kitchens", "event-planners"] },
  { slug: "delhi", name: "Delhi", state: "Delhi", focus: ["clinics-and-doctors", "restaurants", "coaching-centres"] },
  { slug: "hyderabad", name: "Hyderabad", state: "Telangana", focus: ["restaurants", "dental-clinics", "gyms"] },
  { slug: "pune", name: "Pune", state: "Maharashtra", focus: ["cafes", "coaching-centres", "yoga-studios"] },
  { slug: "kolkata", name: "Kolkata", state: "West Bengal", focus: ["bakeries", "coaching-centres", "salons"] },
  { slug: "ahmedabad", name: "Ahmedabad", state: "Gujarat", focus: ["restaurants", "interior-designers", "event-planners"] },
  { slug: "jaipur", name: "Jaipur", state: "Rajasthan", focus: ["event-planners", "restaurants", "beauty-parlours"] },
  { slug: "coimbatore", name: "Coimbatore", state: "Tamil Nadu", focus: ["dental-clinics", "gyms", "coaching-centres"] },
  { slug: "madurai", name: "Madurai", state: "Tamil Nadu", focus: ["clinics-and-doctors", "restaurants", "salons"] },
  { slug: "kochi", name: "Kochi", state: "Kerala", focus: ["cafes", "spas", "event-planners"] },
  { slug: "thiruvananthapuram", name: "Thiruvananthapuram", state: "Kerala", focus: ["clinics-and-doctors", "coaching-centres", "bakeries"] },
  { slug: "lucknow", name: "Lucknow", state: "Uttar Pradesh", focus: ["restaurants", "coaching-centres", "beauty-parlours"] },
  { slug: "chandigarh", name: "Chandigarh", state: "Chandigarh", focus: ["gyms", "salons", "cafes"] },
  { slug: "indore", name: "Indore", state: "Madhya Pradesh", focus: ["restaurants", "coaching-centres", "bakeries"] },
  { slug: "nagpur", name: "Nagpur", state: "Maharashtra", focus: ["clinics-and-doctors", "coaching-centres", "salons"] },
  { slug: "surat", name: "Surat", state: "Gujarat", focus: ["interior-designers", "restaurants", "beauty-parlours"] },
  { slug: "vadodara", name: "Vadodara", state: "Gujarat", focus: ["dental-clinics", "gyms", "cafes"] },
  { slug: "visakhapatnam", name: "Visakhapatnam", state: "Andhra Pradesh", focus: ["restaurants", "clinics-and-doctors", "coaching-centres"] },
  { slug: "bhubaneswar", name: "Bhubaneswar", state: "Odisha", focus: ["coaching-centres", "dental-clinics", "cafes"] },
  { slug: "mysuru", name: "Mysuru", state: "Karnataka", focus: ["yoga-studios", "spas", "restaurants"] },
  { slug: "trichy", name: "Tiruchirappalli", state: "Tamil Nadu", focus: ["clinics-and-doctors", "coaching-centres", "bakeries"] },
  { slug: "goa", name: "Goa", state: "Goa", focus: ["cafes", "spas", "event-planners"] },
];

export function findCity(slug: string): City | undefined {
  return cities.find((city) => city.slug === slug);
}
