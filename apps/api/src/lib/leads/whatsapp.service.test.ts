import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client";
import { createTestUser, deleteTestBusinesses, deleteTestUsers, uniqueBusinessName, uniqueIndianPhone } from "../testing/db-test-helpers";
import { createCampaign } from "../campaigns/campaign.service";
import { ingestBusinessAsLead, persistGeneratedPitch } from "./lead.service";
import { generateWhatsAppAction, normalizePhoneForWhatsApp } from "./whatsapp.service";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { BusinessProviderInput } from "../validation/business";

const createdUserIds: string[] = [];
const EXTERNAL_ID_PREFIX = "whatsapp-service-test-";
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await deleteTestBusinesses(EXTERNAL_ID_PREFIX);
  await prisma.$disconnect();
});

let providerSeq = 0;
// Phase 2 dedup engine: unique name/phone per call (not shared literals) so
// this file's businesses don't tier-2/tier-4 match each other's, or another
// concurrently-running test file's identically-fixtured businesses.
async function newLead(prefix: string, phone: string | null | undefined = undefined) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const campaign = await createCampaign(prisma, user.id, { name: "WhatsApp Test", location: "Chennai", category: "Dental Clinic", websiteRequirement: "ANY", leadLimit: 10 });
  providerSeq += 1;
  const providerInput: BusinessProviderInput = {
    name: uniqueBusinessName("Lakshmi Dental Care"),
    category: "Dental Clinic",
    address: "12 MG Road",
    city: "Chennai",
    phone: phone === undefined ? uniqueIndianPhone() : phone,
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.8,
    reviewCount: 240,
    latitude: null,
    longitude: null,
    source: "demo",
    externalId: `${EXTERNAL_ID_PREFIX}${Date.now()}-${providerSeq}`,
  };
  const { lead } = await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput });
  return { user, lead };
}

describe("normalizePhoneForWhatsApp", () => {
  it("strips formatting characters down to digits only", () => {
    expect(normalizePhoneForWhatsApp("+91-9800000001")).toBe("919800000001");
    expect(normalizePhoneForWhatsApp("+91 (98) 000-00001")).toBe("919800000001");
  });

  it("rejects null/missing phone numbers (test 19)", () => {
    expect(normalizePhoneForWhatsApp(null)).toBeNull();
  });

  it("rejects a too-short digit sequence (not a plausible phone number)", () => {
    expect(normalizePhoneForWhatsApp("12345")).toBeNull();
  });

  it("rejects a too-long digit sequence (beyond E.164's 15-digit maximum)", () => {
    expect(normalizePhoneForWhatsApp("1234567890123456789")).toBeNull();
  });

  it("never invents digits — a rejected number returns null, not a padded/truncated guess", () => {
    expect(normalizePhoneForWhatsApp("123")).toBeNull();
  });
});

describe("generateWhatsAppAction", () => {
  it("generates a WhatsApp URL using only the verified phone and the existing pitch content (tests 17, 18)", async () => {
    const phone = uniqueIndianPhone();
    const { user, lead } = await newLead("generate", phone);
    const pitch = await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Hi Lakshmi Dental Care, we noticed you don't have a website yet.", promptVersion: "v1", modelName: "test-model" });

    const result = await generateWhatsAppAction(prisma, { leadId: lead.id, userId: user.id });

    expect(result.whatsappUrl.startsWith(`https://wa.me/${normalizePhoneForWhatsApp(phone)}?text=`)).toBe(true);
    expect(decodeURIComponent(result.whatsappUrl.split("?text=")[1]!)).toBe(pitch.content);
    expect(result.outreach.channel).toBe("WHATSAPP");
    expect(result.outreach.status).toBe("LINK_GENERATED");
    expect(result.outreach.pitchId).toBe(pitch.id);
    expect(result.outreach.openedAt).toBeNull();
    expect(result.outreach.sentAt).toBeNull();
  });

  it("rejects generation when no pitch has been generated yet, and creates no Outreach row", async () => {
    const { user, lead } = await newLead("no-pitch");
    await expect(generateWhatsAppAction(prisma, { leadId: lead.id, userId: user.id })).rejects.toThrow(ConflictError);

    const outreach = await prisma.outreach.findMany({ where: { leadId: lead.id } });
    expect(outreach).toHaveLength(0);
  });

  it("rejects generation when the business has no valid phone number, and creates no Outreach row (test 19)", async () => {
    const { user, lead } = await newLead("no-phone", null);
    await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Hi there!", promptVersion: "v1", modelName: "test-model" });

    await expect(generateWhatsAppAction(prisma, { leadId: lead.id, userId: user.id })).rejects.toThrow(ValidationError);

    const outreach = await prisma.outreach.findMany({ where: { leadId: lead.id } });
    expect(outreach).toHaveLength(0);
  });

  it("uses the most recent GENERATED pitch when more than one exists", async () => {
    const { user, lead } = await newLead("latest-pitch");
    await persistGeneratedPitch(prisma, { leadId: lead.id, content: "First pitch draft.", promptVersion: "v1", modelName: "test-model" });
    const latest = await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Second, better pitch.", promptVersion: "v1", modelName: "test-model" });

    const result = await generateWhatsAppAction(prisma, { leadId: lead.id, userId: user.id });
    expect(result.outreach.pitchId).toBe(latest.id);
    expect(decodeURIComponent(result.whatsappUrl.split("?text=")[1]!)).toBe("Second, better pitch.");
  });

  it("rejects generation for another user's lead (test 24)", async () => {
    const { lead } = await newLead("owner-a");
    await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Hi there!", promptVersion: "v1", modelName: "test-model" });
    const other = await createTestUser("owner-b");
    createdUserIds.push(other.id);

    await expect(generateWhatsAppAction(prisma, { leadId: lead.id, userId: other.id })).rejects.toThrow(NotFoundError);
    const outreach = await prisma.outreach.findMany({ where: { leadId: lead.id } });
    expect(outreach).toHaveLength(0);
  });

  it("does not transition the lead's status (test 22)", async () => {
    const { user, lead } = await newLead("no-status-change");
    await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Hi there!", promptVersion: "v1", modelName: "test-model" });

    await generateWhatsAppAction(prisma, { leadId: lead.id, userId: user.id });

    const current = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(current?.status).toBe("NEW");
  });

  it("does not record a WHATSAPP_OPENED activity merely from URL generation (test 23)", async () => {
    const { user, lead } = await newLead("no-opened-activity");
    await persistGeneratedPitch(prisma, { leadId: lead.id, content: "Hi there!", promptVersion: "v1", modelName: "test-model" });

    await generateWhatsAppAction(prisma, { leadId: lead.id, userId: user.id });

    const activities = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(activities.some((a) => a.type === "WHATSAPP_OPENED")).toBe(false);
  });
});
