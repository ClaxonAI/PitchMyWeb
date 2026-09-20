import { z } from "zod";
import { paginationQuerySchema } from "./common";

// ---------------------------------------------------------------------------
// Discovery insights (LLM-generated), attached to a provider record.
//
// This is model output, so it is cleaned rather than trusted: markup and any
// URL are stripped (the only link allowed in a pitch is the {{site_link}}
// placeholder the backend fills in at delivery time), whitespace is
// collapsed, and every field is bounded. A malformed insights object is
// dropped instead of failing the whole business.
// ---------------------------------------------------------------------------

export const SITE_LINK_PLACEHOLDER = "{{site_link}}";

const TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

export function cleanModelText(value: string, maxLength: number, options: { keepNewlines?: boolean } = {}): string {
  const cleaned = value
    .split(SITE_LINK_PLACEHOLDER)
    .map((part) => {
      const stripped = part.replace(TAG_PATTERN, "").replace(URL_PATTERN, "");
      return options.keepNewlines
        ? stripped.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
        : stripped.replace(/\s+/g, " ");
    })
    .join(SITE_LINK_PLACEHOLDER)
    .trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trimEnd() : cleaned;
}

const cleanedText = (maxLength: number, options?: { keepNewlines?: boolean }) =>
  z
    .string()
    .transform((value) => cleanModelText(value, maxLength, options))
    .pipe(z.string().min(1));

export const discoveryInsightsSchema = z.object({
  summary: cleanedText(400).optional(),
  services: z
    .array(z.string())
    .max(20)
    .transform((items) =>
      items
        .map((item) => cleanModelText(item, 60))
        .filter((item) => item.length > 0)
        .slice(0, 8),
    )
    .optional(),
  outreachMessage: cleanedText(600, { keepNewlines: true }).optional(),
  model: z.string().trim().min(1).max(80).optional(),
});

export type DiscoveryInsights = z.infer<typeof discoveryInsightsSchema>;

// Raw record coming from a LeadProvider (backend_tasks.md section 22),
// before normalization. Provider responses are external/untrusted input
// (Rule 5) so every field is validated before it reaches normalization.
export const businessProviderInputSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  category: z.string().trim().min(1, "category is required"),
  address: z.string().trim().min(1).optional().nullable(),
  city: z.string().trim().min(1).optional().nullable(),
  phone: z.string().trim().min(1).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  website: z.string().trim().url().optional().nullable(),
  instagram: z.string().trim().min(1).optional().nullable(),
  facebook: z.string().trim().min(1).optional().nullable(),
  rating: z.number().min(0).max(5).optional().nullable(),
  reviewCount: z.number().int().min(0).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  source: z.string().trim().min(1, "source is required"),
  externalId: z.string().trim().min(1).optional().nullable(),
  // Optional — only a provider that returns AI-generated insights sets this.
  // Invalid insights are discarded (null), never fatal.
  insights: discoveryInsightsSchema.nullable().optional().catch(null),
});

export type BusinessProviderInput = z.infer<typeof businessProviderInputSchema>;

export const businessListQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export type BusinessListQuery = z.infer<typeof businessListQuerySchema>;
