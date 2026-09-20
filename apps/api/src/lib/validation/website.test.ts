import { describe, expect, it } from "vitest";
import { templateContentSchema, websiteDesignJsonSchema, websiteProjectCreateSchema, websiteProjectUpdateSchema } from "./website";

const validContent = {
  template: "clinic-modern",
  businessName: "Lakshmi Dental Care",
  theme: "clean",
  hero: {
    headline: "Trusted Dental Care for Your Family",
    subheadline: "Modern dental care in Chennai.",
    cta: "Book Appointment",
  },
  services: ["Dental Implants", "Teeth Cleaning", "Orthodontics"],
  contact: {
    phone: "+91-9800000001",
    address: "Chennai",
  },
};

describe("templateContentSchema", () => {
  it("accepts a valid, fully-populated content object (test 1)", () => {
    expect(templateContentSchema.safeParse(validContent).success).toBe(true);
  });

  it("accepts a second registry template (proves the registry is real, not a single hardcoded string)", () => {
    expect(templateContentSchema.safeParse({ ...validContent, template: "restaurant-classic" }).success).toBe(true);
  });

  it("rejects an unknown/arbitrary template value (test 13)", () => {
    const result = templateContentSchema.safeParse({ ...validContent, template: "made-up-template" });
    expect(result.success).toBe(false);
  });

  it("rejects a completely missing template field", () => {
    const { template: _template, ...withoutTemplate } = validContent;
    expect(templateContentSchema.safeParse(withoutTemplate).success).toBe(false);
  });

  it("rejects extra/unknown top-level fields (arbitrary component definitions)", () => {
    const result = templateContentSchema.safeParse({ ...validContent, customComponent: { type: "iframe", src: "https://evil.example.com" } });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields nested inside hero/contact", () => {
    expect(templateContentSchema.safeParse({ ...validContent, hero: { ...validContent.hero, rawHtml: "<div>x</div>" } }).success).toBe(false);
    expect(templateContentSchema.safeParse({ ...validContent, contact: { ...validContent.contact, script: "alert(1)" } }).success).toBe(false);
  });

  it("rejects HTML/markup-looking text in every free-text field (test 14)", () => {
    expect(templateContentSchema.safeParse({ ...validContent, businessName: "<b>Bold</b> Dental" }).success).toBe(false);
    expect(templateContentSchema.safeParse({ ...validContent, hero: { ...validContent.hero, headline: "<script>alert(1)</script>" } }).success).toBe(false);
    expect(templateContentSchema.safeParse({ ...validContent, hero: { ...validContent.hero, cta: "Book <img src=x onerror=alert(1)>" } }).success).toBe(false);
    expect(templateContentSchema.safeParse({ ...validContent, services: ["<svg onload=alert(1)>"] }).success).toBe(false);
    expect(templateContentSchema.safeParse({ ...validContent, contact: { ...validContent.contact, address: "<a href=javascript:alert(1)>here</a>" } }).success).toBe(false);
  });

  it("enforces field length limits", () => {
    expect(templateContentSchema.safeParse({ ...validContent, businessName: "x".repeat(201) }).success).toBe(false);
    expect(templateContentSchema.safeParse({ ...validContent, hero: { ...validContent.hero, headline: "x".repeat(201) } }).success).toBe(false);
    expect(templateContentSchema.safeParse({ ...validContent, services: Array.from({ length: 21 }, (_, i) => `service-${i}`) }).success).toBe(false);
  });

  it("allows contact.phone/address to be omitted (optional) but not empty strings", () => {
    const { contact: _contact, ...withoutContactFields } = validContent;
    expect(templateContentSchema.safeParse({ ...withoutContactFields, contact: {} }).success).toBe(true);
    expect(templateContentSchema.safeParse({ ...validContent, contact: { phone: "" } }).success).toBe(false);
  });
});

describe("websiteDesignJsonSchema", () => {
  it("accepts a small flat map of primitive values", () => {
    expect(websiteDesignJsonSchema.safeParse({ primaryColor: "#0044cc", fontSize: 16, roundedCorners: true }).success).toBe(true);
  });

  it("rejects a value containing HTML/markup", () => {
    expect(websiteDesignJsonSchema.safeParse({ note: "<script>alert(1)</script>" }).success).toBe(false);
  });

  it("rejects more than 20 keys (bounded, not arbitrary structured data)", () => {
    const tooMany = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`key${i}`, "value"]));
    expect(websiteDesignJsonSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rejects nested objects/arrays (flat primitives only, no component tree)", () => {
    expect(websiteDesignJsonSchema.safeParse({ nested: { a: 1 } }).success).toBe(false);
    expect(websiteDesignJsonSchema.safeParse({ list: [1, 2, 3] }).success).toBe(false);
  });
});

describe("websiteProjectCreateSchema", () => {
  it("accepts leadId + contentJSON without a redundant top-level template/theme", () => {
    const result = websiteProjectCreateSchema.safeParse({ leadId: "lead-1", contentJSON: validContent });
    expect(result.success).toBe(true);
  });

  it("rejects an unrelated top-level template field (single source of truth is contentJSON.template)", () => {
    const result = websiteProjectCreateSchema.safeParse({ leadId: "lead-1", template: "clinic-modern", contentJSON: validContent });
    expect(result.success).toBe(false);
  });

  it("rejects a missing leadId", () => {
    expect(websiteProjectCreateSchema.safeParse({ contentJSON: validContent }).success).toBe(false);
  });
});

describe("websiteProjectUpdateSchema", () => {
  it("accepts a full replacement contentJSON", () => {
    expect(websiteProjectUpdateSchema.safeParse({ contentJSON: validContent }).success).toBe(true);
  });

  it("rejects client-controlled status/publishedUrl/leadId fields (section 9)", () => {
    expect(websiteProjectUpdateSchema.safeParse({ contentJSON: validContent, status: "PUBLISHED" }).success).toBe(false);
    expect(websiteProjectUpdateSchema.safeParse({ contentJSON: validContent, publishedUrl: "https://evil.example.com" }).success).toBe(false);
    expect(websiteProjectUpdateSchema.safeParse({ contentJSON: validContent, leadId: "someone-elses-lead" }).success).toBe(false);
  });

  it("requires contentJSON (no partial/empty patch — a new version needs full content)", () => {
    expect(websiteProjectUpdateSchema.safeParse({}).success).toBe(false);
  });
});
