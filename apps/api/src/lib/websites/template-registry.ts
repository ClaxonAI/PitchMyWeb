// Template registry (backend_tasks.md section 30, Phase 6 section 4). The
// single source of truth for which template codes are allowed to exist —
// the backend, not the client and not the AI, defines this set. Adding a
// template means adding an entry here (and, if it needs different fields,
// extending templateContentSchema in lib/validation/website.ts); nothing
// about the request/response contract lets a caller register a new one.
//
// V1 prioritizes a small number of genuinely working templates over
// covering every category: two templates are enough to prove the registry
// is real (not a single hardcoded string) and to cover the two most common
// demo business shapes already seeded in this project (clinics and
// restaurants/cafes) without expanding into a general page-builder.

export type TemplateDefinition = {
  code: string;
  /** Loose category hint for UI/matching purposes only — not used for access control. */
  category: string;
  description: string;
  /**
   * Which content contract the template uses: `generic` is
   * templateContentSchema in lib/validation/website.ts; `dental` is the typed
   * contract from @pitchmyweb/templates, rendered by apps/sites.
   */
  contentFormat: "generic" | "dental";
};

export const TEMPLATE_REGISTRY = {
  "clinic-modern": {
    code: "clinic-modern",
    category: "clinic",
    description: "Modern single-page template for clinics, salons, and appointment-based service businesses.",
    contentFormat: "generic",
  },
  "restaurant-classic": {
    code: "restaurant-classic",
    category: "restaurant",
    description: "Classic single-page template for restaurants, cafes, and bakeries.",
    contentFormat: "generic",
  },
  "dental-clinic": {
    code: "dental-clinic",
    category: "dental",
    description: "Premium single-page site for dental clinics, rendered by apps/sites and recorded for WhatsApp pitches.",
    contentFormat: "dental",
  },
  clinic: {
    code: "clinic",
    category: "clinic",
    description: "Consultant clinic preview from scraped facts, hosted and recorded for WhatsApp.",
    contentFormat: "dental",
  },
  restaurant: {
    code: "restaurant",
    category: "restaurant",
    description: "Restaurant preview from scraped facts (sachu45 restaurant template).",
    contentFormat: "dental",
  },
  salon: {
    code: "salon",
    category: "salon",
    description: "Salon preview from scraped facts (sachu45 salon template).",
    contentFormat: "dental",
  },
  gym: {
    code: "gym",
    category: "gym",
    description: "Gym / fitness preview from scraped facts (sachu45 gym template).",
    contentFormat: "dental",
  },
  interiors: {
    code: "interiors",
    category: "interiors",
    description: "Interiors studio preview from scraped facts (sachu45 interiors template).",
    contentFormat: "dental",
  },
  event: {
    code: "event",
    category: "event",
    description: "Event planner preview from scraped facts (sachu45 event template).",
    contentFormat: "dental",
  },
  coaching: {
    code: "coaching",
    category: "coaching",
    description: "Coaching centre preview from scraped facts (sachu45 coaching template).",
    contentFormat: "dental",
  },
} as const satisfies Record<string, TemplateDefinition>;

export type TemplateCode = keyof typeof TEMPLATE_REGISTRY;

export const ALLOWED_TEMPLATE_CODES = Object.keys(TEMPLATE_REGISTRY) as [TemplateCode, ...TemplateCode[]];

/** Template codes that use the generic content contract. */
export const GENERIC_TEMPLATE_CODES = ["clinic-modern", "restaurant-classic"] as const satisfies readonly TemplateCode[];

export function isKnownTemplate(code: string): code is TemplateCode {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_REGISTRY, code);
}

export function getTemplateDefinition(code: TemplateCode): TemplateDefinition {
  return TEMPLATE_REGISTRY[code];
}
