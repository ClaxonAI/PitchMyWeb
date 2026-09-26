import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildPreviewContent,
  designsFor,
  PREVIEW_TEMPLATE_CODES,
  type DentalBusinessInput,
  type DentalContent,
  type DentalLeadInput,
} from "@pitchmyweb/templates";
import { PreviewSite } from "./PreviewSite";
import { previewCardColors, previewThemeColor } from "./surface";

// Every template × design × data shape must keep the contract the rest of the
// system relies on: sections the recorder can tour, links that go somewhere,
// only the facts we were given, and a clear "this is a concept" notice.

const NOW = new Date("2026-01-15T10:00:00.000Z");

const FIXTURES: Record<string, { business: DentalBusinessInput; lead: DentalLeadInput }> = {
  rich: {
    business: {
      name: "Harbour & Vine",
      city: "Kochi",
      address: "12 Beach Road, Fort Kochi, Kochi 682001",
      phone: "+91 98470 12345",
      rating: 4.6,
      reviewCount: 1287,
    },
    lead: { summary: "A neighbourhood favourite by the water.", services: ["Weekday lunch", "Family dinners", "Private events", "Takeaway"] },
  },
  // Nothing but a name: no phone, no location, no rating, generic services.
  sparse: { business: { name: "Sri Lakshmi" }, lead: {} },
  // Every field at or near its limit.
  long: {
    business: {
      name: "Sri Venkateswara Multi-Speciality Wellness and Family Care Centre, Main Branch Opposite Bus Stand",
      city: "Thiruvananthapuram",
      address: `${"Door 14/2231, Near Government Higher Secondary School, ".repeat(5)}Kerala 695001`,
      phone: "+91 471 234 5678",
      rating: 5,
      reviewCount: 99999,
      latitude: 8.5,
      longitude: 76.9,
    },
    lead: {
      services: Array.from({ length: 12 }, (_, i) => `Comprehensive consultation and follow-up programme number ${i + 1}`),
    },
  },
};

// The root class of each standalone design, so a test can tell which one rendered.
const DESIGN_ROOT: Record<string, string> = {
  "dental-clinic/studio": "smile-studio",
  "dental-clinic/editorial": "dent-journal",
  "dental-clinic/atelier": "dent-atelier",
  "clinic/studio": "clinic-studio",
  "clinic/editorial": "clinic-report",
  "clinic/atelier": "clinic-sanctum",
  "restaurant/editorial": "menu-card",
  "restaurant/atelier": "supper-club",
  "salon/editorial": "salon-vogue",
  "salon/atelier": "salon-maison",
  "restaurant/studio": "table-cloth",
  "salon/studio": "salon",
  "gym/studio": "training",
  "interiors/studio": "interiors-studio",
  "event/studio": "scene",
  "coaching/studio": "academy-shell",
};

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(content: DentalContent) {
  return renderToStaticMarkup(<PreviewSite content={content} />);
}

const cases = PREVIEW_TEMPLATE_CODES.flatMap((template) =>
  designsFor(template).flatMap((design) =>
    Object.entries(FIXTURES).map(([fixture, { business, lead }]) => ({
      name: `${template} / ${design} / ${fixture}`,
      template,
      design,
      fixture,
      content: buildPreviewContent(business, lead, { template, design, now: NOW }),
    })),
  ),
);

describe("PreviewSite", () => {
  it.each(cases)("$name renders a complete, honest page", ({ template, design, fixture, content }) => {
    const html = render(content);

    // The requested design is the one on screen.
    if (design === "classic") expect(html).toContain(`data-theme="${content.theme}"`);
    else expect(html).toContain(`class="${DESIGN_ROOT[`${template}/${design}`]}`);

    // The recorder tours [data-section] in order and refuses a page without them.
    const sections = [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1]);
    expect(sections[0]).toBe("hero");
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections).toContain("services");
    expect(new Set(sections).size).toBe(sections.length);
    expect(html).toContain("data-reveal");

    // One page title, and the business is named on it.
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(escapeHtml(content.businessName));

    // Every in-page link lands on something.
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    for (const [, target] of html.matchAll(/href="#([^"]*)"/g)) expect(ids, `#${target}`).toContain(target);

    // External links open safely.
    for (const [tag] of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) expect(tag).toContain('rel="noopener noreferrer"');

    // Nothing leaks from missing data, and nothing is made up.
    expect(html).not.toMatch(/>[^<]*\b(undefined|NaN|null)\b[^<]*</);
    expect(html).not.toMatch(/="(undefined|null|NaN)"/);
    expect(html).not.toMatch(/₹|Rs\.?\s?\d|\$\s?\d/);
    expect(html.toLowerCase()).not.toContain("testimonial");

    // It says it is a concept.
    expect(html).toContain("Website concept prepared for");

    // Contact: WhatsApp when there is a phone; otherwise no dead buttons.
    if (content.phoneDigits) {
      expect(html).toContain(`https://wa.me/${content.phoneDigits}`);
      expect(html).toContain(`tel:+${content.phoneDigits}`);
    } else {
      expect(html).not.toContain("wa.me");
      expect(html).not.toContain("tel:");
      if (design !== "classic") expect(html).toContain(`Booking details for ${escapeHtml(content.businessName)} will appear here.`);
    }
    if (content.mapsQuery && design !== "classic") expect(html).toContain("maps.google.com/maps?q=");
    if (fixture === "sparse") expect(content.servicesAreGeneric).toBe(true);
  });

  it("renders content stored before designs existed in the classic layout", () => {
    const legacy: DentalContent = { ...buildPreviewContent(FIXTURES.rich!.business, {}, { template: "gym", design: "studio", now: NOW }) };
    delete legacy.design;
    const html = render(legacy);
    expect(html).toContain('data-theme="ember"');
    expect(html).not.toContain('class="training');
  });

  it("gives every template and design a theme colour and a link-preview card palette", () => {
    for (const { content } of cases) {
      expect(previewThemeColor(content)).toMatch(/^#[0-9a-f]{6}$/);
      const card = previewCardColors(content);
      for (const value of [card.background, card.color, card.accent]) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
