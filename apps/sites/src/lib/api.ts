import { dentalContentSchema, PREVIEW_TEMPLATE_CODES } from "@pitchmyweb/templates";
import { z } from "zod";

// Server-side reads from the API's public endpoints. The browser never talks
// to the API from a preview page.

const API_URL = (process.env.API_INTERNAL_URL ?? process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

const publicSiteSchema = z.object({
  slug: z.string(),
  template: z.enum(PREVIEW_TEMPLATE_CODES),
  content: dentalContentSchema,
  expired: z.boolean(),
  expiresAt: z.string().nullable(),
  hasVideo: z.boolean(),
  // Optional so a sites deploy that lands before the API one still parses.
  hasLaptopVideo: z.boolean().optional().default(false),
});

export type PublicSite = z.infer<typeof publicSiteSchema>;

const SLUG_PATTERN = /^[a-z0-9-]{3,80}$/;

/** The published preview, or null when it does not exist. */
export async function fetchSite(slug: string): Promise<PublicSite | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const response = await fetch(`${API_URL}/api/public/sites/${slug}`, { next: { revalidate: 300, tags: [`site:${slug}`] } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Preview lookup failed (${response.status})`);
  const parsed = publicSiteSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

/** A fresh signed URL for the preview's walkthrough video, or null. */
export async function fetchVideoUrl(slug: string, view: "phone" | "laptop" = "phone"): Promise<string | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const response = await fetch(`${API_URL}/api/public/sites/${slug}/video${view === "laptop" ? "?view=laptop" : ""}`, { redirect: "manual", cache: "no-store" });
  if (response.status !== 302 && response.status !== 307) return null;
  const location = response.headers.get("location");
  return location && /^https?:\/\//.test(location) ? location : null;
}
