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
};

export const TEMPLATE_REGISTRY = {
  "clinic-modern": {
    code: "clinic-modern",
    category: "clinic",
    description: "Modern single-page template for clinics, salons, and appointment-based service businesses.",
  },
  "restaurant-classic": {
    code: "restaurant-classic",
    category: "restaurant",
    description: "Classic single-page template for restaurants, cafes, and bakeries.",
  },
} as const satisfies Record<string, TemplateDefinition>;

export type TemplateCode = keyof typeof TEMPLATE_REGISTRY;

export const ALLOWED_TEMPLATE_CODES = Object.keys(TEMPLATE_REGISTRY) as [TemplateCode, ...TemplateCode[]];

export function isKnownTemplate(code: string): code is TemplateCode {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_REGISTRY, code);
}

export function getTemplateDefinition(code: TemplateCode): TemplateDefinition {
  return TEMPLATE_REGISTRY[code];
}
