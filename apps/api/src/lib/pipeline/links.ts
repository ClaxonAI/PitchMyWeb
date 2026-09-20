import { SITE_LINK_PLACEHOLDER } from "../validation/business";
import { sitesPublicUrl } from "../websites/website.service";

// Everything the delivery pipeline puts in front of a clinic owner: preview
// links and the final message text.

export const DEFAULT_PREVIEW_TTL_DAYS = 30;
export const MAX_DELIVERY_MESSAGE_CHARS = 1000;

export function previewTtlDays(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number(env.PREVIEW_TTL_DAYS);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 365 ? parsed : DEFAULT_PREVIEW_TTL_DAYS;
}

export function previewExpiry(now = new Date()): Date {
  return new Date(now.getTime() + previewTtlDays() * 24 * 60 * 60 * 1000);
}

/** Public page that plays the recorded walkthrough, or null without apps/sites. */
export function videoPageUrl(slug: string): string | null {
  const base = sitesPublicUrl();
  return base ? `${base}/s/${slug}/video` : null;
}

function capWithLink(message: string, suffix: string, max: number): string {
  if (message.length + suffix.length <= max) return `${message}${suffix}`;
  const room = Math.max(0, max - suffix.length - 1);
  return `${message.slice(0, room).trimEnd()}…${suffix}`;
}

/**
 * Replaces the {{site_link}} placeholder with the preview URL. A message
 * without the placeholder gets the link appended, so the owner always
 * receives it. The result never exceeds MAX_DELIVERY_MESSAGE_CHARS and the
 * link is never truncated.
 */
export function fillSiteLink(template: string, siteUrl: string, max = MAX_DELIVERY_MESSAGE_CHARS): string {
  const text = template.trim();
  if (text.includes(SITE_LINK_PLACEHOLDER)) {
    const filled = text.split(SITE_LINK_PLACEHOLDER).join(siteUrl);
    if (filled.length <= max) return filled;
    // Too long: keep the text before the first placeholder and end with the link.
    const before = text.split(SITE_LINK_PLACEHOLDER)[0]!.trimEnd();
    return capWithLink(before, ` ${siteUrl}`, max);
  }
  return capWithLink(text, `\n\n${siteUrl}`, max);
}

/** Direct plan: the pitch with the preview link, plus the video page. */
export function directMessage(template: string, siteUrl: string, videoUrl: string | null): string {
  const suffix = videoUrl ? `\n\nVideo walkthrough: ${videoUrl}` : "";
  return `${fillSiteLink(template, siteUrl, MAX_DELIVERY_MESSAGE_CHARS - suffix.length)}${suffix}`;
}

/**
 * Pitch used when discovery did not provide one (e.g. demo leads). Plain,
 * factual, and short; it makes no claims about the business beyond its name.
 */
export function fallbackPitch(businessName: string): string {
  return [
    `Hi ${businessName} team,`,
    `I noticed ${businessName} doesn't have a website yet, so I put together a free sample site to show what it could look like: ${SITE_LINK_PLACEHOLDER}`,
    "If you like it, I can make it live with your photos, timings and booking details. Happy to share more?",
  ].join("\n\n");
}

export const FALLBACK_PITCH_PROMPT_VERSION = "template-fallback-v1";
