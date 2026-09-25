// Mirrors apps/api/src/lib/pipeline/message-template.ts for the live preview
// on the create-campaign form. The API is the source of truth and validates
// again; keep the default and the limits in step with it.

export const BUSINESS_NAME_PLACEHOLDER = "{{business_name}}";
export const SITE_LINK_PLACEHOLDER = "{{site_link}}";
export const MIN_MESSAGE_TEMPLATE_CHARS = 20;
export const MAX_MESSAGE_TEMPLATE_CHARS = 800;

export const DEFAULT_MESSAGE_TEMPLATE = [
  `Hi ${BUSINESS_NAME_PLACEHOLDER} team,`,
  `I noticed ${BUSINESS_NAME_PLACEHOLDER} doesn't have a website yet, so I put together a free sample site to show what it could look like: ${SITE_LINK_PLACEHOLDER}`,
  "I've attached two short videos of it — one on a phone, one on a laptop. If you like it, I can make it live with your photos, timings and booking details. Happy to share more?",
].join("\n\n");

/** What one business will receive, for the preview under the editor. */
export function previewMessage(template: string, businessName: string, siteUrl: string): string {
  const filled = template.split(BUSINESS_NAME_PLACEHOLDER).join(businessName).split(SITE_LINK_PLACEHOLDER).join(siteUrl);
  return template.includes(SITE_LINK_PLACEHOLDER) ? filled : `${filled.trim()}\n\n${siteUrl}`;
}

/** Why the API would refuse this message, or null when it is fine. */
export function messageTemplateProblem(template: string): string | null {
  const text = template.trim();
  if (text.length < MIN_MESSAGE_TEMPLATE_CHARS) return `Write at least ${MIN_MESSAGE_TEMPLATE_CHARS} characters.`;
  if (text.length > MAX_MESSAGE_TEMPLATE_CHARS) return `Keep it under ${MAX_MESSAGE_TEMPLATE_CHARS} characters.`;
  if (/<\/?[a-zA-Z][^>]*>/.test(text)) return "Plain text only — no HTML.";
  if (/\{\{(?!business_name\}\}|site_link\}\})[^}]*\}\}/.test(text)) return "Only {{business_name}} and {{site_link}} can be used.";
  return null;
}
