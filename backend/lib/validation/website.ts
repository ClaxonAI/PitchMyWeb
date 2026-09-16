import { z } from "zod";
import { paginationQuerySchema, websiteStatusSchema } from "./common";
import { ALLOWED_TEMPLATE_CODES } from "../websites/template-registry";

// Phase 6 section 6: website content is untrusted input. A plain string
// field can still carry an XSS payload as its literal text (e.g. a
// headline of "<script>...</script>") even though the contract has no
// dedicated HTML field — rejecting anything that looks like a markup tag
// is a deterministic, dependency-free way to keep "structured data" from
// becoming "structured data that happens to contain a tag" once a future
// frontend renders it. Every free-text field in the template contract goes
// through this, not just a couple of them.
const HTML_LIKE_PATTERN = /<\/?[a-zA-Z][^>]*>/;

function safeText(maxLength: number, fieldName = "value") {
  return z
    .string()
    .trim()
    .min(1, `${fieldName} is required`)
    .max(maxLength, `${fieldName} must be at most ${maxLength} characters`)
    .refine((value) => !HTML_LIKE_PATTERN.test(value), { message: `${fieldName} must not contain HTML/markup` });
}

// Fixed template contract (backend_tasks.md section 30, Phase 6 section 3).
// `.strict()` at every level — including the nested objects — so no extra
// key (e.g. a "customHtml" or "script" field smuggled alongside the
// allowed ones) is ever silently accepted; Rule 6/Phase 6 section 5: "do
// not trust the model's/client's claimed JSON structure," reject arbitrary
// unknown structures outright rather than dropping the extras.
export const templateContentSchema = z
  .object({
    // Phase 6 section 4: only registry-known template codes are valid —
    // never an arbitrary string. isKnownTemplate()/TEMPLATE_REGISTRY is the
    // single source of truth; this schema and the service layer both read
    // from the same ALLOWED_TEMPLATE_CODES list rather than duplicating it.
    template: z.enum(ALLOWED_TEMPLATE_CODES),
    businessName: safeText(200, "businessName"),
    theme: safeText(50, "theme"),
    hero: z
      .object({
        headline: safeText(200, "hero.headline"),
        subheadline: safeText(400, "hero.subheadline"),
        cta: safeText(100, "hero.cta"),
      })
      .strict(),
    services: z.array(safeText(100, "services[]")).max(20),
    contact: z
      .object({
        phone: safeText(30, "contact.phone").optional(),
        address: safeText(300, "contact.address").optional(),
      })
      .strict(),
  })
  .strict();

export type TemplateContent = z.infer<typeof templateContentSchema>;

// designJSON (Phase 1: intentionally JSON — "controlled AI/template
// content"). Constrained to a flat map of short primitive values (e.g.
// simple theme-color overrides) rather than left as arbitrary nested JSON:
// a flat, bounded, primitives-only shape cannot carry a nested "component
// tree" or executable structure, and string values still go through the
// same HTML-tag rejection as every other free-text field.
export const websiteDesignJsonSchema = z
  .record(
    z.string().trim().min(1).max(50),
    z.union([
      z
        .string()
        .trim()
        .max(200)
        .refine((value) => !HTML_LIKE_PATTERN.test(value), { message: "design value must not contain HTML/markup" }),
      z.number(),
      z.boolean(),
    ]),
  )
  .refine((value) => Object.keys(value).length <= 20, { message: "designJSON supports at most 20 keys" });

export type WebsiteDesignJson = z.infer<typeof websiteDesignJsonSchema>;

// POST /api/websites (section 7). `template`/`theme` are deliberately NOT
// accepted as separate top-level fields here (the original Phase 1/2 draft
// had both a top-level `template`/`theme` AND `contentJSON.template`/
// `contentJSON.theme`, which could disagree with each other). The
// WebsiteProject columns of the same name are populated by the service
// layer FROM contentJSON — one source of truth, not two independently
// client-settable copies of it.
export const websiteProjectCreateSchema = z
  .object({
    leadId: z.string().trim().min(1, "leadId is required"),
    contentJSON: templateContentSchema,
    designJSON: websiteDesignJsonSchema.optional(),
  })
  .strict();

export type WebsiteProjectCreateInput = z.infer<typeof websiteProjectCreateSchema>;

// PATCH /api/websites/:id (section 9/10): every PATCH represents creating a
// new WebsiteVersion, so the full new content is required, not a partial
// merge (a "partial template" has no well-defined meaning for a structured
// contract like this). No `status`, no `publishedUrl`, no `leadId`, no
// version id — all of those are backend-controlled (status only ever
// changes via POST /:id/publish; leadId is fixed at creation).
export const websiteProjectUpdateSchema = z
  .object({
    contentJSON: templateContentSchema,
    designJSON: websiteDesignJsonSchema.optional(),
  })
  .strict();

export type WebsiteProjectUpdateInput = z.infer<typeof websiteProjectUpdateSchema>;

// POST /api/websites/:id/publish: no body fields required — mirrors
// campaignRunRequestSchema's empty-body-friendly shape for a
// no-configuration action endpoint.
export const websitePublishRequestSchema = z.object({}).strict();

export type WebsitePublishRequest = z.infer<typeof websitePublishRequestSchema>;

// GET /api/websites (section 1): scoped to the authenticated user's own
// leads at the query level (see lib/websites/website.service.ts) — this
// only validates the filter/pagination shape.
export const websiteListQuerySchema = paginationQuerySchema.extend({
  leadId: z.string().trim().min(1).optional(),
  status: websiteStatusSchema.optional(),
});

export type WebsiteListQuery = z.infer<typeof websiteListQuerySchema>;
