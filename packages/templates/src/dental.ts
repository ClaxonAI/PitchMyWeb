import { z } from "zod";

// The dental-clinic template's "placeholders", as a typed contract.
//
// apps/api builds this object from a lead (buildDentalContent), validates it,
// and stores it as WebsiteProject.contentJSON. apps/sites renders it. Nothing
// in between is free-form: every field is bounded plain text, so a preview can
// never carry markup or script, whatever the scraper or the LLM returned.
//
// Honesty rules (backend_tasks.md §21/§29): the builder only states facts we
// actually have (name, area, address, phone, Google rating/reviews). It never
// invents doctors, years in practice, prices, awards or testimonials. When
// the clinic's own services are unknown, the site shows common treatments and
// says so.

export const DENTAL_TEMPLATE_CODE = "dental-clinic" as const;

/** Typed preview templates hosted by apps/sites and recorded for WhatsApp. */
export const PREVIEW_TEMPLATE_CODES = [
  "dental-clinic",
  "clinic",
  "restaurant",
  "salon",
  "gym",
  "interiors",
  "event",
  "coaching",
] as const;

export type PreviewTemplateCode = (typeof PREVIEW_TEMPLATE_CODES)[number];

export function isPreviewTemplate(code: string): code is PreviewTemplateCode {
  return (PREVIEW_TEMPLATE_CODES as readonly string[]).includes(code);
}

/**
 * Visual layouts a preview template can be rendered in. `classic` is the
 * original shared layout; `studio` is the set of standalone sachu45 designs
 * (one per vertical). Both render the same content contract. Content stored
 * before this field existed has no `design` and renders as `classic`.
 */
export const PREVIEW_DESIGNS = ["classic", "studio"] as const;
export type PreviewDesign = (typeof PREVIEW_DESIGNS)[number];

/** Verticals that have a studio design. The dental clinic only has the classic one. */
export function hasStudioDesign(template: PreviewTemplateCode): boolean {
  return template !== "dental-clinic";
}

/** Picks a design at random for a template. `random` is injectable so tests can be deterministic. */
export function pickPreviewDesign(template: PreviewTemplateCode, random: () => number = Math.random): PreviewDesign {
  if (!hasStudioDesign(template)) return "classic";
  return PREVIEW_DESIGNS[Math.min(PREVIEW_DESIGNS.length - 1, Math.floor(random() * PREVIEW_DESIGNS.length))]!;
}

const HTML_LIKE_PATTERN = /<\/?[a-zA-Z][^>]*>/;

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !HTML_LIKE_PATTERN.test(value), { message: "must not contain HTML/markup" });

export const DENTAL_THEMES = ["teal", "sage", "navy", "amber", "violet", "ember", "stone", "wine", "ink"] as const;
export type DentalTheme = (typeof DENTAL_THEMES)[number];

export const DENTAL_SERVICE_ICONS = [
  "checkup",
  "whitening",
  "implant",
  "braces",
  "rootcanal",
  "filling",
  "crown",
  "kids",
  "extraction",
  "gum",
  "emergency",
  "smile",
  "generic",
] as const;
export type DentalServiceIcon = (typeof DENTAL_SERVICE_ICONS)[number];

export const dentalServiceSchema = z
  .object({
    title: text(60),
    description: text(160),
    icon: z.enum(DENTAL_SERVICE_ICONS),
  })
  .strict();

export const dentalContentSchema = z
  .object({
    template: z.enum(PREVIEW_TEMPLATE_CODES),
    design: z.enum(PREVIEW_DESIGNS).optional(),
    theme: z.enum(DENTAL_THEMES),
    businessName: text(120),
    area: text(120).optional(),
    tagline: text(160),
    intro: text(400),
    phone: text(40).optional(),
    phoneDigits: z
      .string()
      .regex(/^\d{8,15}$/)
      .optional(),
    address: text(300).optional(),
    mapsQuery: text(300).optional(),
    rating: z.number().min(0).max(5).optional(),
    reviewCount: z.number().int().min(0).optional(),
    services: z.array(dentalServiceSchema).min(3).max(9),
    /** True when `services` are common treatments rather than the clinic's own list. */
    servicesAreGeneric: z.boolean(),
    faqs: z
      .array(z.object({ question: text(140), answer: text(400) }).strict())
      .max(6),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type DentalContent = z.infer<typeof dentalContentSchema>;
export type DentalService = z.infer<typeof dentalServiceSchema>;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export type DentalBusinessInput = {
  name: string;
  category?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type DentalLeadInput = {
  summary?: string | null;
  services?: readonly string[] | null;
};

type KnownService = { match: RegExp; title: string; description: string; icon: DentalServiceIcon };

// Descriptions are deliberately general statements about the treatment, not
// claims about how this clinic performs it.
const KNOWN_SERVICES: KnownService[] = [
  { match: /check.?up|cleaning|scal|hygien|preventive|exam/i, title: "Check-ups & cleaning", description: "Routine examinations and professional cleaning to keep teeth and gums healthy.", icon: "checkup" },
  { match: /whiten|bleach/i, title: "Teeth whitening", description: "Brighten stained or discoloured teeth with professional whitening.", icon: "whitening" },
  { match: /implant/i, title: "Dental implants", description: "A long-term way to replace missing teeth that looks and feels natural.", icon: "implant" },
  { match: /brace|align|orthodont|invisalign/i, title: "Braces & aligners", description: "Straighten teeth and correct bite problems with braces or clear aligners.", icon: "braces" },
  { match: /root.?canal|endodont|rct/i, title: "Root canal treatment", description: "Save an infected or badly damaged tooth and relieve the pain.", icon: "rootcanal" },
  { match: /fill|cavit|restor/i, title: "Fillings", description: "Repair cavities with tooth-coloured fillings.", icon: "filling" },
  { match: /crown|bridge|veneer|prosth|denture/i, title: "Crowns, bridges & dentures", description: "Restore the shape, strength and look of damaged or missing teeth.", icon: "crown" },
  { match: /kid|child|paediatric|pediatric|pedo/i, title: "Children's dentistry", description: "Gentle care that helps children feel comfortable at the dentist.", icon: "kids" },
  { match: /extract|wisdom|surgery|oral surg/i, title: "Extractions & oral surgery", description: "Safe removal of damaged or wisdom teeth when it is needed.", icon: "extraction" },
  { match: /gum|periodont/i, title: "Gum care", description: "Treatment for bleeding, swollen or receding gums.", icon: "gum" },
  { match: /emergenc|pain|toothache/i, title: "Emergency dental care", description: "Help for sudden toothache, broken teeth and other urgent problems.", icon: "emergency" },
  { match: /cosmetic|smile|aesthetic|design/i, title: "Cosmetic dentistry", description: "Improve the look of your smile with cosmetic treatments.", icon: "smile" },
];

const COMMON_SERVICES = ["checkup", "filling", "rootcanal", "whitening", "braces", "kids"] as const;

function commonService(icon: DentalServiceIcon): DentalService {
  const known = KNOWN_SERVICES.find((service) => service.icon === icon)!;
  return { title: known.title, description: known.description, icon: known.icon };
}

const HTML_TAGS_GLOBAL = /<\/?[a-zA-Z][^>]*>/g;

export const cleanTemplateText = (value: string | null | undefined, max: number): string | undefined => {
  if (!value) return undefined;
  const collapsed = value.replace(HTML_TAGS_GLOBAL, "").replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  return collapsed.length > max ? `${collapsed.slice(0, max - 1).trimEnd()}…` : collapsed;
};

type Faq = DentalContent["faqs"][number];

/**
 * FAQ text is composed from the business name and address, which can each be
 * long; clamp it to the schema's limits so a long address can never make
 * dentalContentSchema.parse throw and fail the whole site build.
 */
export function clampFaq(faq: Faq): Faq {
  return {
    question: cleanTemplateText(faq.question, 140) ?? faq.question,
    answer: cleanTemplateText(faq.answer, 400) ?? faq.answer,
  };
}

/** Digits-only phone for tel:/wa.me links, or undefined when implausible. */
export function phoneToDigits(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

function pickTheme(name: string): DentalTheme {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return DENTAL_THEMES[hash % DENTAL_THEMES.length]!;
}

function buildServices(raw: readonly string[] | null | undefined): { services: DentalService[]; generic: boolean } {
  const services: DentalService[] = [];
  const seen = new Set<DentalServiceIcon>();

  for (const item of raw ?? []) {
    const known = KNOWN_SERVICES.find((service) => service.match.test(item));
    if (!known || seen.has(known.icon)) continue;
    seen.add(known.icon);
    services.push({ title: known.title, description: known.description, icon: known.icon });
    if (services.length === 6) break;
  }

  if (services.length >= 3) return { services, generic: false };
  return { services: COMMON_SERVICES.map(commonService), generic: true };
}

function buildFaqs(name: string, phone: string | undefined, address: string | undefined): DentalContent["faqs"] {
  const faqs: DentalContent["faqs"] = [
    {
      question: "How do I book an appointment?",
      answer: phone
        ? `Send a message on WhatsApp or call ${phone}. The team will confirm a time that suits you.`
        : `Get in touch with ${name} to find a time that suits you.`,
    },
    {
      question: "Is the clinic taking new patients?",
      answer: "New patients are welcome. Message the clinic to check the next available appointment.",
    },
    {
      question: "What should I bring to my first visit?",
      answer: "Bring any previous dental records or X-rays, a list of medicines you take, and arrive a few minutes early.",
    },
  ];
  if (address) {
    faqs.push({ question: "Where is the clinic?", answer: `You can find ${name} at ${address}.` });
  }
  return faqs.map(clampFaq);
}

export type BuildDentalContentOptions = { now?: Date };

/**
 * Fills the dental template from what discovery actually found. Every
 * optional field is omitted when unknown, and the template hides whatever
 * depends on it, so a preview never shows an empty or made-up section.
 */
export function buildDentalContent(
  business: DentalBusinessInput,
  lead: DentalLeadInput = {},
  options: BuildDentalContentOptions = {},
): DentalContent {
  const businessName = cleanTemplateText(business.name, 120) ?? "Dental Clinic";
  const area = cleanTemplateText(business.city, 120);
  const address = cleanTemplateText(business.address, 300);
  const phone = cleanTemplateText(business.phone, 40);
  const phoneDigits = phoneToDigits(business.phone);
  const { services, generic } = buildServices(lead.services);

  const rating =
    typeof business.rating === "number" && business.rating > 0 ? Math.round(Math.min(5, business.rating) * 10) / 10 : undefined;
  const reviewCount =
    typeof business.reviewCount === "number" && business.reviewCount > 0 ? Math.floor(business.reviewCount) : undefined;

  const summary = cleanTemplateText(lead.summary, 400);
  const intro =
    summary ??
    `${businessName} is a dental clinic${area ? ` in ${area}` : ""} welcoming new and returning patients for everyday and specialist care.`;

  const mapsQuery =
    address || area
      ? cleanTemplateText([businessName, address ?? area].filter(Boolean).join(", "), 300)
      : typeof business.latitude === "number" && typeof business.longitude === "number"
        ? `${business.latitude},${business.longitude}`
        : undefined;

  const content: DentalContent = {
    template: DENTAL_TEMPLATE_CODE,
    design: "classic",
    theme: pickTheme(businessName),
    businessName,
    ...(area ? { area } : {}),
    tagline: area ? `Calm, modern dental care in ${area}` : "Calm, modern dental care for the whole family",
    intro,
    ...(phone ? { phone } : {}),
    ...(phoneDigits ? { phoneDigits } : {}),
    ...(address ? { address } : {}),
    ...(mapsQuery ? { mapsQuery } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(reviewCount !== undefined ? { reviewCount } : {}),
    services,
    servicesAreGeneric: generic,
    faqs: buildFaqs(businessName, phone, address),
    generatedAt: (options.now ?? new Date()).toISOString(),
  };

  return dentalContentSchema.parse(content);
}
