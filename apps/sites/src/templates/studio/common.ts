import type { CSSProperties } from "react";
import type { DentalContent } from "@pitchmyweb/templates";
import { getPreviewChrome } from "@pitchmyweb/templates";

// Shared helpers for the studio designs. Like the classic layout, every studio
// design renders only what discovery found (name, area, address, phone,
// Google rating, the service list) plus the vertical's own chrome copy. Prices,
// opening hours, staff, testimonials and years in business are never invented,
// so the sections of the original sachu45 designs that depended on them are
// rebuilt from real facts or left out.
//
// Every design must also keep the contract the rest of the system relies on:
// - `data-section` on each major section, hero first. apps/recorder-worker
//   refuses to record a page without them and tours them in order.
// - `data-reveal` on blocks that should fade in (RevealOnScroll).
// - `fixed` on floating chrome, so the marketing embed (.demo-embed) hides it.

export type StudioProps = { content: DentalContent };
export type StudioChrome = ReturnType<typeof getPreviewChrome>;
export type StudioLinks = { whatsapp: string | null; call: string | null; maps: string | null };

export function studioLinks(content: DentalContent): { chrome: StudioChrome; links: StudioLinks } {
  const chrome = getPreviewChrome(content.template);
  const greeting = `Hi ${content.businessName}, ${chrome.greeting}`;
  return {
    chrome,
    links: {
      whatsapp: content.phoneDigits ? `https://wa.me/${content.phoneDigits}?text=${encodeURIComponent(greeting)}` : null,
      call: content.phoneDigits ? `tel:+${content.phoneDigits}` : null,
      maps: content.mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(content.mapsQuery)}` : null,
    },
  };
}

/** The primary action: WhatsApp, then phone, then the design's own contact section. */
export function primaryHref(links: StudioLinks, contactAnchor: `#${string}`): string {
  return links.whatsapp ?? links.call ?? contactAnchor;
}

export function externalProps(href: string): { target?: "_blank"; rel?: string } {
  return href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function pad(n: number): string {
  return String(n + 1).padStart(2, "0");
}

/** Stagger for a [data-reveal] block (see .js [data-reveal] in globals.css). */
export function revealDelay(ms: number): CSSProperties {
  return { ["--reveal-delay" as string]: `${ms}ms` } as CSSProperties;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-IN");
}

/** "4.6 out of 5 from 141 Google reviews", or null when there is no rating. */
export function ratingLine(content: DentalContent): string | null {
  if (content.rating === undefined) return null;
  const source = content.reviewCount ? ` from ${formatCount(content.reviewCount)} Google reviews` : " on Google";
  return `${content.rating.toFixed(1)} out of 5${source}`;
}

export type StudioFact = { value: string; label: string };

/** Rating, review count and the size of the service list — the only numbers we know. */
export function studioFacts(content: DentalContent, services: { listed: string; typical: string }): StudioFact[] {
  const facts: StudioFact[] = [];
  if (content.rating !== undefined) facts.push({ value: content.rating.toFixed(1), label: "Google rating" });
  if (content.reviewCount) facts.push({ value: formatCount(content.reviewCount), label: "Google reviews" });
  facts.push({ value: String(content.services.length), label: content.servicesAreGeneric ? services.typical : services.listed });
  return facts;
}

/** The vertical's three visit steps; the first points at the WhatsApp button when there is one. */
export function visitSteps(content: DentalContent, links: StudioLinks, chrome: StudioChrome): { title: string; body: string }[] {
  return chrome.visitSteps.map((step, i) => ({
    title: step.title,
    body:
      i === 0 && links.whatsapp
        ? `Tap the WhatsApp button and tell ${content.businessName} what you need.`
        : step.body(content.businessName, content.address),
  }));
}

export type StudioAction = { key: "whatsapp" | "call" | "maps"; href: string; label: string };

export function contactActions(links: StudioLinks, chrome: StudioChrome): StudioAction[] {
  const actions: StudioAction[] = [];
  if (links.whatsapp) actions.push({ key: "whatsapp", href: links.whatsapp, label: chrome.cta });
  if (links.call) actions.push({ key: "call", href: links.call, label: chrome.callCta });
  if (links.maps) actions.push({ key: "maps", href: links.maps, label: "Get directions" });
  return actions;
}

/** Shown where the contact buttons would be when discovery found no phone and no location. */
export function noContactNote(content: DentalContent): string {
  return `Booking details for ${content.businessName} will appear here.`;
}

export function conceptNotice(content: DentalContent, chrome: StudioChrome): string {
  return `This is a website concept prepared for ${content.businessName}. It is a preview, not the ${chrome.footerKind}'s official website.`;
}

/** "Common … — ask what is offered" when the list is a vertical default, not the business's own. */
export function servicesNote(content: DentalContent, chrome: StudioChrome): string | null {
  return content.servicesAreGeneric
    ? `Common ${chrome.noun.toLowerCase()} offerings. Please confirm what ${content.businessName} offers when you get in touch.`
    : null;
}
