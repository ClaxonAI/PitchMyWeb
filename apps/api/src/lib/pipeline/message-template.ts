import { z } from "zod";
import { SITE_LINK_PLACEHOLDER } from "../validation/business";

// The WhatsApp message a campaign sends, written by the user on the create
// form. Two placeholders are filled per lead:
//
//   {{business_name}}  the business being pitched
//   {{site_link}}      its preview site (links.ts::fillSiteLink; appended if absent)
//
// apps/web/src/lib/message-template.ts mirrors the default and the rules for
// the live preview; this module is the source of truth.

export const BUSINESS_NAME_PLACEHOLDER = "{{business_name}}";
export { SITE_LINK_PLACEHOLDER };

export const MIN_MESSAGE_TEMPLATE_CHARS = 20;
export const MAX_MESSAGE_TEMPLATE_CHARS = 800;

export const DEFAULT_MESSAGE_TEMPLATE = [
  `Hi ${BUSINESS_NAME_PLACEHOLDER} team,`,
  `I noticed ${BUSINESS_NAME_PLACEHOLDER} doesn't have a website yet, so I put together a free sample site to show what it could look like: ${SITE_LINK_PLACEHOLDER}`,
  "I've attached two short videos of it — one on a phone, one on a laptop. If you like it, I can make it live with your photos, timings and booking details. Happy to share more?",
].join("\n\n");

const TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/;
const UNKNOWN_PLACEHOLDER = /\{\{(?!business_name\}\}|site_link\}\})[^}]*\}\}/;

/** Normalises what the user typed: line endings, trailing spaces, runs of blank lines. */
function tidy(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const messageTemplateSchema = z
  .string()
  .transform(tidy)
  .pipe(
    z
      .string()
      .min(MIN_MESSAGE_TEMPLATE_CHARS, `The message must be at least ${MIN_MESSAGE_TEMPLATE_CHARS} characters`)
      .max(MAX_MESSAGE_TEMPLATE_CHARS, `The message must be at most ${MAX_MESSAGE_TEMPLATE_CHARS} characters`)
      .refine((value) => !TAG_PATTERN.test(value), "The message must be plain text, without HTML")
      .refine((value) => !UNKNOWN_PLACEHOLDER.test(value), "Only {{business_name}} and {{site_link}} can be used as placeholders"),
  );

/**
 * Fills {{business_name}}. {{site_link}} is left for fillSiteLink, which
 * knows the preview URL and guarantees the link survives any length cap.
 */
export function renderMessageTemplate(template: string, businessName: string): string {
  return template.split(BUSINESS_NAME_PLACEHOLDER).join(businessName.trim());
}

export const CAMPAIGN_TEMPLATE_PROMPT_VERSION = "campaign-template-v1";
