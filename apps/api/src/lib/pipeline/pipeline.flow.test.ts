import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { buildDentalContent, buildPreviewContent, dentalContentSchema, pickPreviewTemplate, PREVIEW_TEMPLATE_CODES } from "@pitchmyweb/templates";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { createCampaign, markCampaignReady } from "../campaigns/campaign.service";
import { runCampaign } from "../campaigns/run.service";
import { autoSelectForUser, listCampaignLeads, selectLeads } from "../campaigns/selection.service";
import { getOrCreateWallet, grantCredits } from "../checkout/wallet.service";
import { ingestBusinessAsLead } from "../leads/lead.service";
import type { AsyncLeadProvider } from "../providers/async-provider";
import { handleDiscoveryResults } from "../../app/api/internal/pipeline/discovery-results/route";
import { ConflictError, NotFoundError, UnauthenticatedError, ValidationError } from "../errors";
import { getPublicSite } from "../sites/public-site.service";
import { handleRecordingReady } from "../../app/api/internal/pipeline/recording-ready/route";
import { directMessage, fillSiteLink, MAX_DELIVERY_MESSAGE_CHARS } from "./links";
import {
  markDirectSent,
  onRecordingFinished,
  pauseCampaignSending,
  prepareDelivery,
  retryPipeline,
  syncDeliveries,
  type PipelineDeps,
} from "./pipeline.service";
import { getPipelineVideoUrl, listCampaignPipelines, VideoExpiredError } from "./pipeline-view";
import { getPublicVideoUrl } from "../sites/public-site.service";

const SOURCE = "pipeline:test";
const JOB_SECRET = "pipeline-test-jobs-secret-0123456789";
const createdUserIds: string[] = [];
let seq = 0;

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.optOut.deleteMany({ where: { reason: "pipeline-test" } });
  await prisma.business.deleteMany({ where: { source: SOURCE } });
  await prisma.$disconnect();
});

const acceptingProvider: AsyncLeadProvider = { name: "osm", trigger: async () => ({ externalRunId: null }) };

/** Records enqueued recording jobs instead of touching Redis. */
function fakeDeps() {
  const jobs: string[] = [];
  const deps: PipelineDeps = { enqueueRecording: async ({ recordingId }) => void jobs.push(recordingId) };
  return { deps, jobs };
}

function uniquePhone(): string {
  seq += 1;
  return `+91 98${String(Date.now()).slice(-6)}${String(seq).padStart(2, "0")}`;
}

function clinic(name: string, overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    name,
    category: "Dental Clinic",
    city: "Chennai",
    address: `${seq} Anna Salai, Chennai`,
    phone: uniquePhone(),
    website: null,
    rating: 4.5,
    reviewCount: 120,
    source: SOURCE,
    externalId: `pt-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    insights: {
      summary: `${name} offers family dentistry in Chennai.`,
      services: ["Teeth cleaning", "Root canal", "Braces", "Implants"],
      outreachMessage: `Hi ${name} team! I built a sample website for you: {{site_link}} Would you like to see it live?`,
      model: "gpt-4o-mini",
    },
    ...overrides,
  };
}

async function discoveredCampaign(
  label: string,
  businesses: unknown[],
  settings: { selectionMode?: "MANUAL" | "AUTO"; targetCount?: number; deliveryMode?: "AUTO" | "DIRECT" } = {},
  // Pass an existing user to give them a second campaign — repeat-lead
  // protection is per user, so proving it needs two campaigns under one.
  existingUser?: Awaited<ReturnType<typeof createTestUser>>,
) {
  const user = existingUser ?? (await createTestUser(`pipeline-${label}`));
  if (!existingUser) {
    createdUserIds.push(user.id);
    // Generous, fixed grant: selectLeads/autoSelectLeads now reserve real
    // wallet credits, and this file's tests only care about pipeline
    // behavior once a lead is selected, not about credit exhaustion —
    // wallet.service.test.ts and selection.service.test.ts cover that.
    await grantCredits(prisma, { userId: user.id, amount: 500, type: "PURCHASE", referenceId: `test-grant:${user.id}` });
  }
  const campaign = await createCampaign(prisma, user.id, {
    name: `Pipeline ${label}`,
    location: "Chennai",
    category: "Dental Clinic",
    websiteRequirement: "WITHOUT_WEBSITE",
    selectionMode: settings.selectionMode ?? "MANUAL",
    targetCount: settings.targetCount ?? 5,
    deliveryMode: settings.deliveryMode ?? "AUTO",
  });
  await markCampaignReady(prisma, user.id, campaign.id);
  const { execution } = await runCampaign(prisma, user.id, campaign.id, { provider: acceptingProvider });
  // Unlike n8n's incremental batch + separate completion events, the
  // discovery-results endpoint ingests and finalizes in one call.
  await postDiscoveryResults(execution.id, businesses);
  return { user, campaign, execution };
}

async function postDiscoveryResults(executionId: string, businesses: unknown[]) {
  const request = new NextRequest("http://localhost/api/internal/pipeline/discovery-results", {
    method: "POST",
    headers: { authorization: `Bearer ${JOB_SECRET}` },
    body: JSON.stringify({ executionId, businesses }),
  });
  return handleDiscoveryResults(prisma, request, JOB_SECRET);
}

async function readyRecording(recordingId: string) {
  await prisma.demoRecording.update({
    where: { id: recordingId },
    data: { status: "READY", storageKey: `recordings/test/${recordingId}.mp4`, mimeType: "video/mp4", durationMs: 22000, sizeBytes: 3_000_000 },
  });
}

async function connectWhatsApp(userId: string) {
  return prisma.whatsAppAccount.create({
    data: { userId, status: "CONNECTED", phoneNumber: "919000000001", lastConnectedAt: new Date() },
  });
}

describe("links", () => {
  it("fills the placeholder, or appends the link when there is none", () => {
    expect(fillSiteLink("See {{site_link}} now", "https://p.example/s/a")).toBe("See https://p.example/s/a now");
    expect(fillSiteLink("Hello there", "https://p.example/s/a")).toBe("Hello there\n\nhttps://p.example/s/a");
  });

  it("never truncates the link when the message is too long", () => {
    const long = `${"word ".repeat(400)}{{site_link}}`;
    const filled = fillSiteLink(long, "https://p.example/s/abc");
    expect(filled.length).toBeLessThanOrEqual(MAX_DELIVERY_MESSAGE_CHARS);
    expect(filled.endsWith("https://p.example/s/abc")).toBe(true);
  });

  it("adds the video page for Direct messages", () => {
    const text = directMessage("Hi {{site_link}}", "https://p.example/s/a", "https://p.example/s/a/video");
    expect(text).toContain("https://p.example/s/a");
    expect(text).toContain("Video walkthrough: https://p.example/s/a/video");
  });
});

describe("buildDentalContent", () => {
  it("uses only real facts and marks generic services", () => {
    const content = buildDentalContent({ name: "Smile <b>Care</b>", city: null, address: null, phone: null, rating: null, reviewCount: 0 });
    expect(dentalContentSchema.safeParse(content).success).toBe(true);
    expect(content.businessName).toBe("Smile Care");
    expect(content.rating).toBeUndefined();
    expect(content.reviewCount).toBeUndefined();
    expect(content.phone).toBeUndefined();
    expect(content.address).toBeUndefined();
    expect(content.servicesAreGeneric).toBe(true);
    expect(content.faqs.some((f) => f.question === "Where is the clinic?")).toBe(false);
  });

  it("maps the clinic's own services and contact details", () => {
    const content = buildDentalContent(
      { name: "Bright Dental", city: "Pune", address: "12 MG Road, Pune", phone: "+91 98765 43210", rating: 4.76, reviewCount: 212 },
      { summary: "Bright Dental is a family clinic in Pune.", services: ["Invisalign aligners", "Dental implants", "Kids dentistry", "Whitening"] },
    );
    expect(content.servicesAreGeneric).toBe(false);
    expect(content.services.map((s) => s.icon)).toEqual(["braces", "implant", "kids", "whitening"]);
    expect(content.phoneDigits).toBe("919876543210");
    expect(content.rating).toBe(4.8);
    expect(content.reviewCount).toBe(212);
    expect(content.intro).toBe("Bright Dental is a family clinic in Pune.");
  });
});

describe("buildPreviewContent", () => {
  it("picks restaurant from category and fills scrape facts only", () => {
    expect(pickPreviewTemplate("Restaurant")).toBe("restaurant");
    expect(pickPreviewTemplate("Hair Salon")).toBe("salon");
    expect(pickPreviewTemplate("Gym")).toBe("gym");
    const content = buildPreviewContent(
      { name: "Spice <b>House</b>", category: "Restaurant", city: "Chennai", address: "1 Beach Road", phone: "+91 98765 43210", rating: 4.2, reviewCount: 80 },
      { services: ["Biryani", "Tandoor", "Family dining"] },
    );
    expect(content.template).toBe("restaurant");
    expect(content.businessName).toBe("Spice House");
    expect(content.phoneDigits).toBe("919876543210");
    expect(content.address).toBe("1 Beach Road");
    expect(content.servicesAreGeneric).toBe(false);
    expect(content.services.map((s) => s.title)).toEqual(["Biryani", "Tandoor", "Family dining"]);
    expect(dentalContentSchema.safeParse(content).success).toBe(true);
  });
});

describe("discovery ingest with insights", () => {
  it("stores score, summary, services and a pitch; strips URLs and markup from model text", async () => {
    const { campaign } = await discoveredCampaign("ingest", [
      clinic("Ingest Dental", {
        insights: {
          summary: "<p>Great clinic</p> see https://spam.example",
          services: ["Braces", "<script>x</script>"],
          outreachMessage: "Hello! Visit www.evil.example or {{site_link}}",
          model: "gpt-4o-mini",
        },
      }),
    ]);
    const lead = await prisma.lead.findFirstOrThrow({ where: { campaignId: campaign.id }, include: { pitches: true, scores: true } });
    expect(lead.score).toBeGreaterThan(0);
    expect(lead.scores).toHaveLength(1);
    expect(lead.summary).toBe("Great clinic see");
    expect(lead.services).toEqual(["Braces", "x"]);
    expect(lead.pitches[0]?.content).toBe("Hello! Visit or {{site_link}}");
    expect(lead.pitches[0]?.modelName).toBe("gpt-4o-mini");
  });

  it("drops malformed insights without failing the business", async () => {
    const { campaign } = await discoveredCampaign("bad-insights", [clinic("Odd Dental", { insights: { services: "not-an-array" } })]);
    const lead = await prisma.lead.findFirstOrThrow({ where: { campaignId: campaign.id }, include: { pitches: true } });
    expect(lead.summary).toBeNull();
    expect(lead.pitches).toHaveLength(0);
  });
});

describe("repeat leads", () => {
  it("never hands the same business back in a later campaign, and searches past it to still deliver targetCount", async () => {
    const { user, campaign: first } = await discoveredCampaign("repeat-first", [clinic("Repeat Dental")], { targetCount: 1 });
    const firstLeads = await prisma.lead.findMany({ where: { campaignId: first.id }, include: { business: true } });
    expect(firstLeads.map((lead) => lead.business.name)).toEqual(["Repeat Dental"]);

    // Same user, second campaign, and discovery finds the same clinic again
    // at the top of its results — as it does in reality, because the search
    // is the same search. It must be skipped, and the slot it would have
    // taken filled by the next clinic instead.
    const { campaign: second } = await discoveredCampaign(
      "repeat-second",
      [clinic("Repeat Dental"), clinic("Fresh Dental")],
      { targetCount: 1 },
      user,
    );
    const secondLeads = await prisma.lead.findMany({ where: { campaignId: second.id }, include: { business: true } });
    expect(secondLeads.map((lead) => lead.business.name)).toEqual(["Fresh Dental"]);
  });
});

describe("selection", () => {
  // Discovery order, not score. "No Phone Dental" sits between the two
  // reachable clinics and must not consume a slot: targetCount promises
  // leads that can be pitched, so the search continues past it.
  it("auto-selects targetCount pitchable leads in discovery order, and builds + publishes their sites", async () => {
    const { campaign } = await discoveredCampaign(
      "auto",
      [
        clinic("Low Dental", { rating: 3.1, reviewCount: 4 }),
        clinic("No Phone Dental", { phone: null, rating: 5, reviewCount: 999 }),
        clinic("Top Dental", { rating: 4.9, reviewCount: 800 }),
        clinic("Mid Dental", { rating: 4.4, reviewCount: 90 }),
      ],
      { selectionMode: "AUTO", targetCount: 2 },
    );

    const pipelines = await prisma.leadPipeline.findMany({ where: { campaignId: campaign.id }, include: { lead: { include: { business: true } } } });
    expect(pipelines.map((p) => p.lead.business.name).sort()).toEqual(["Low Dental", "Top Dental"]);
    for (const pipeline of pipelines) {
      expect(pipeline.stage).toBe("RECORDING");
      const project = await prisma.websiteProject.findUniqueOrThrow({ where: { id: pipeline.websiteProjectId! } });
      expect(project.status).toBe("PUBLISHED");
      expect(project.template).toBe("dental-clinic");
      expect(project.publishedUrl).toContain(`/s/${project.slug}`);
      expect(project.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: pipeline.leadId } });
      expect(lead.status).toBe("SITE_READY");
      const recording = await prisma.demoRecording.findUniqueOrThrow({ where: { id: pipeline.recordingId! } });
      expect(recording.status).toBe("QUEUED");
    }
  });

  it("manual selection enforces ownership, eligibility and the target count", async () => {
    // Phoneless first so it is stored without consuming a slot; A and B then
    // fill targetCount and discovery stops. C is ingested directly afterwards
    // so a third selectable lead exists to test the slot guard with — through
    // discovery it could never exist, because the cap stops at two.
    const { user, campaign } = await discoveredCampaign(
      "manual",
      [clinic("Phoneless", { phone: null }), clinic("A Dental"), clinic("B Dental")],
      { targetCount: 2 },
    );
    await ingestBusinessAsLead(prisma, { campaignId: campaign.id, providerInput: clinic("C Dental") });
    const { items } = await listCampaignLeads(prisma, user.id, campaign.id);
    const byName = new Map(items.map((row) => [row.business.name, row]));
    expect(byName.get("Phoneless")?.selectable).toBe(false);

    const other = await createTestUser("pipeline-intruder");
    createdUserIds.push(other.id);
    await expect(selectLeads(prisma, other.id, campaign.id, [byName.get("A Dental")!.id])).rejects.toThrow(NotFoundError);
    await expect(selectLeads(prisma, user.id, campaign.id, [byName.get("Phoneless")!.id])).rejects.toThrow(ValidationError);
    await expect(
      selectLeads(prisma, user.id, campaign.id, ["A Dental", "B Dental", "C Dental"].map((n) => byName.get(n)!.id)),
    ).rejects.toThrow(ValidationError);

    const { deps, jobs } = fakeDeps();
    const { started } = await selectLeads(prisma, user.id, campaign.id, [byName.get("A Dental")!.id], deps);
    expect(started).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    await expect(selectLeads(prisma, user.id, campaign.id, [byName.get("A Dental")!.id], deps)).rejects.toThrow(ValidationError);

    const auto = await autoSelectForUser(prisma, user.id, campaign.id, undefined, deps);
    expect(auto.started).toHaveLength(1); // one slot left
  });
});

async function recordingStage(label: string, deliveryMode: "AUTO" | "DIRECT") {
  const { user, campaign } = await discoveredCampaign(label, [clinic(`${label} Dental`)], { deliveryMode });
  const lead = await prisma.lead.findFirstOrThrow({ where: { campaignId: campaign.id } });
  const { deps } = fakeDeps();
  const [pipeline] = (await selectLeads(prisma, user.id, campaign.id, [lead.id], deps)).started;
  return { user, campaign, lead, pipeline: pipeline! };
}

describe("recording hand-off and delivery", () => {
  it("rejects recording callbacks without the job secret", async () => {
    const request = new NextRequest("http://localhost/api/internal/pipeline/recording-ready", {
      method: "POST",
      body: JSON.stringify({ recordingId: "x" }),
    });
    await expect(handleRecordingReady(prisma, request, JOB_SECRET)).rejects.toThrow(UnauthenticatedError);
  });

  it("Auto: fails clearly without a connected WhatsApp, then queues a video message once connected (via retry)", async () => {
    const { user, pipeline, lead } = await recordingStage("auto-send", "AUTO");
    await readyRecording(pipeline.recordingId!);

    const request = new NextRequest("http://localhost/api/internal/pipeline/recording-ready", {
      method: "POST",
      headers: { authorization: `Bearer ${JOB_SECRET}` },
      body: JSON.stringify({ recordingId: pipeline.recordingId }),
    });
    const response = await handleRecordingReady(prisma, request, JOB_SECRET);
    expect((await response.json()).stage).toBe("FAILED");
    let row = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(row.failureReason).toBe("whatsapp_not_connected");
    expect(row.failureStage).toBe("DELIVERY_QUEUED");

    await connectWhatsApp(user.id);
    row = await retryPipeline(prisma, user.id, pipeline.id);
    expect(row.stage).toBe("DELIVERY_QUEUED");

    const message = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: row.whatsappMessageId! } });
    const project = await prisma.websiteProject.findUniqueOrThrow({ where: { id: row.websiteProjectId! } });
    expect(message.status).toBe("QUEUED");
    expect(message.mediaKind).toBe("VIDEO");
    expect(message.mediaStorageKey).toBe(`recordings/test/${pipeline.recordingId}.mp4`);
    expect(message.body).toContain(project.publishedUrl!);
    expect(message.body).not.toContain("{{site_link}}");
    expect(message.leadId).toBe(lead.id);

    // The storage key stays server-side.
    const view = await listCampaignPipelines(prisma, user.id, pipeline.campaignId);
    expect(JSON.stringify(view)).not.toContain("recordings/test/");

    // SENT alone is not proof of delivery: the pipeline keeps waiting.
    await prisma.whatsAppMessage.update({ where: { id: message.id }, data: { status: "SENT", sentAt: new Date() } });
    expect(await syncDeliveries(prisma, { campaignId: pipeline.campaignId })).toBe(0);
    expect((await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } })).stage).toBe("DELIVERY_QUEUED");

    // Delivery receipt -> pipeline SENT, lead PITCHED.
    await prisma.whatsAppMessage.update({ where: { id: message.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    expect(await syncDeliveries(prisma, { campaignId: pipeline.campaignId })).toBe(1);
    expect((await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } })).stage).toBe("SENT");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("PITCHED");
  });

  it("Auto: a sent message with no delivery receipt after 24h fails as not_delivered", async () => {
    const { user, pipeline, lead } = await recordingStage("undelivered", "AUTO");
    await connectWhatsApp(user.id);
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);
    const queued = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    await prisma.whatsAppMessage.update({ where: { id: queued.whatsappMessageId! }, data: { status: "SENT", sentAt: new Date() } });

    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(await syncDeliveries(prisma, { campaignId: pipeline.campaignId, now: tomorrow })).toBe(1);
    const failed = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(failed.stage).toBe("FAILED");
    expect(failed.failureReason).toBe("not_delivered");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("SITE_READY");
  });

  it("Auto: an opted-out number is recorded as a delivery failure with its policy reason", async () => {
    const { user, pipeline, lead } = await recordingStage("opted-out", "AUTO");
    await connectWhatsApp(user.id);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: lead.businessId } });
    await prisma.optOut.create({ data: { phoneNumber: business.phone!.replace(/\D/g, ""), source: "MANUAL", reason: "pipeline-test" } });
    await readyRecording(pipeline.recordingId!);
    const result = await onRecordingFinished(prisma, pipeline.recordingId!);
    expect(result.stage).toBe("FAILED");
    expect((await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } })).failureReason).toBe("opted_out");
  });

  it("Auto: a blocked or cancelled message fails the pipeline; pause cancels queued sends", async () => {
    const { user, pipeline } = await recordingStage("pause", "AUTO");
    await connectWhatsApp(user.id);
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);
    const queued = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(queued.stage).toBe("DELIVERY_QUEUED");

    const { cancelled } = await pauseCampaignSending(prisma, user.id, pipeline.campaignId);
    expect(cancelled).toBe(1);
    const paused = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(paused.stage).toBe("FAILED");
    expect(paused.failureReason).toBe("paused");
    expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: queued.whatsappMessageId! } })).status).toBe("CANCELLED");
  });

  it("Direct: prepares a wa.me link with the site and video links, then marks SENT on confirmation", async () => {
    const { user, pipeline, lead } = await recordingStage("direct", "DIRECT");
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);

    const row = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(row.stage).toBe("LINK_READY");
    const project = await prisma.websiteProject.findUniqueOrThrow({ where: { id: row.websiteProjectId! } });
    const text = decodeURIComponent(row.whatsappUrl!.split("?text=")[1]!);
    expect(row.whatsappUrl).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(text).toContain(project.publishedUrl!);
    expect(text).toContain(`/s/${project.slug}/video`);

    const sent = await markDirectSent(prisma, user.id, pipeline.id);
    expect(sent.stage).toBe("SENT");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("PITCHED");
    const outreach = await prisma.outreach.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(outreach.status).toBe("SENT");
  });

  it("a failed recording can be retried, which queues a new recording", async () => {
    const { user, pipeline } = await recordingStage("retry-rec", "AUTO");
    await prisma.demoRecording.update({ where: { id: pipeline.recordingId! }, data: { status: "FAILED", failureReason: "navigation_timeout" } });
    await onRecordingFinished(prisma, pipeline.recordingId!);
    const failed = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(failed.failureReason).toBe("navigation_timeout");

    const { deps, jobs } = fakeDeps();
    const retried = await retryPipeline(prisma, user.id, pipeline.id, deps);
    expect(retried.stage).toBe("RECORDING");
    expect(retried.recordingId).not.toBe(pipeline.recordingId);
    expect(jobs).toEqual([retried.recordingId]);
  });

  it("repeated recording callbacks are harmless", async () => {
    const { pipeline } = await recordingStage("idempotent", "DIRECT");
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);
    const again = await onRecordingFinished(prisma, pipeline.recordingId!);
    expect(again.stage).toBe("LINK_READY");
    expect(await prisma.outreach.count({ where: { leadId: pipeline.leadId } })).toBe(1);
  });
});

describe("WhatsApp session after the campaign", () => {
  async function deliverOnlyPitch(label: string, stayLinked: boolean) {
    const { user, pipeline } = await recordingStage(label, "AUTO");
    const linkedAt = new Date();
    const account = await prisma.whatsAppAccount.create({
      data: {
        userId: user.id,
        status: "CONNECTED",
        phoneNumber: "919000000001",
        lastConnectedAt: linkedAt,
        linkedAt,
        stayLinkedUntil: stayLinked ? new Date(linkedAt.getTime() + 3 * 24 * 60 * 60 * 1000) : null,
      },
    });
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);
    const queued = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    // Still sending: the receipt has not arrived, so the number stays linked.
    await syncDeliveries(prisma, { campaignId: pipeline.campaignId });
    expect((await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: account.id } })).logoutReason).toBeNull();

    await prisma.whatsAppMessage.update({ where: { id: queued.whatsappMessageId! }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await syncDeliveries(prisma, { campaignId: pipeline.campaignId });
    return prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: account.id } });
  }

  it("signs the number out the moment the campaign's last pitch is delivered", async () => {
    const account = await deliverOnlyPitch("signout-after", false);
    expect(account.logoutReason).toBe("campaign_finished");
  });

  it("keeps it linked when the user chose to stay signed in for 3 days", async () => {
    const account = await deliverOnlyPitch("stay-linked-after", true);
    expect(account.logoutReason).toBeNull();
  });
});

describe("credit resolution", () => {
  it("consumes exactly one credit when a pipeline reaches SENT via a delivery receipt", async () => {
    const { user, pipeline } = await recordingStage("credit-consume", "AUTO");
    const before = await getOrCreateWallet(prisma, user.id);
    await connectWhatsApp(user.id);
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);
    const queued = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });

    await prisma.whatsAppMessage.update({ where: { id: queued.whatsappMessageId! }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    expect(await syncDeliveries(prisma, { campaignId: pipeline.campaignId })).toBe(1);

    const after = await getOrCreateWallet(prisma, user.id);
    expect(after).toMatchObject({ reservedCredits: before.reservedCredits - 1, usedCredits: before.usedCredits + 1 });
    const resolved = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(resolved.creditOutcome).toBe("CONSUMED");

    // A second syncDeliveries pass over the same (now-SENT) pipeline must
    // not consume a second credit — the DELIVERY_QUEUED-stage guard alone
    // already prevents this from re-matching, proving the pipeline never
    // stays double-claimable once resolved.
    expect(await syncDeliveries(prisma, { campaignId: pipeline.campaignId })).toBe(0);
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject(after);
  });

  it("consumes exactly one credit when a Direct pipeline is marked sent", async () => {
    const { user, pipeline } = await recordingStage("credit-consume-direct", "DIRECT");
    const before = await getOrCreateWallet(prisma, user.id);
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);

    const sent = await markDirectSent(prisma, user.id, pipeline.id);
    expect(sent.stage).toBe("SENT");

    const after = await getOrCreateWallet(prisma, user.id);
    expect(after).toMatchObject({ reservedCredits: before.reservedCredits - 1, usedCredits: before.usedCredits + 1 });

    // A repeated confirm on an already-SENT pipeline must not consume twice.
    await expect(markDirectSent(prisma, user.id, pipeline.id)).rejects.toThrow(ConflictError);
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject(after);
  });

  it("refunds immediately on a non-retryable final failure (not_delivered), not a delayed retry", async () => {
    const { user, pipeline } = await recordingStage("credit-refund-not-delivered", "AUTO");
    const before = await getOrCreateWallet(prisma, user.id);
    await connectWhatsApp(user.id);
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);
    const queued = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    await prisma.whatsAppMessage.update({ where: { id: queued.whatsappMessageId! }, data: { status: "SENT", sentAt: new Date() } });

    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(await syncDeliveries(prisma, { campaignId: pipeline.campaignId, now: tomorrow })).toBe(1);

    const after = await getOrCreateWallet(prisma, user.id);
    expect(after).toMatchObject({ reservedCredits: before.reservedCredits - 1, availableCredits: before.availableCredits + 1 });
    const failed = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(failed.creditOutcome).toBe("REFUNDED");

    const refundLedger = await prisma.pitchCreditLedger.findFirst({ where: { pipelineId: pipeline.id, type: "REFUND" } });
    expect(refundLedger?.amount).toBe(1);

    // A repeated maintenance pass over the same FAILED pipeline (e.g. two
    // overlapping job runs) must not refund a second time.
    expect(await syncDeliveries(prisma, { campaignId: pipeline.campaignId, now: tomorrow })).toBe(0);
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject(after);
  });

  it("refunds immediately when opted-out (a non-retryable reason), and updates the batch's counters", async () => {
    const { user, pipeline, lead } = await recordingStage("credit-refund-opted-out", "AUTO");
    const before = await getOrCreateWallet(prisma, user.id);
    await connectWhatsApp(user.id);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: lead.businessId } });
    await prisma.optOut.create({ data: { phoneNumber: business.phone!.replace(/\D/g, ""), source: "MANUAL", reason: "pipeline-test" } });
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);

    const after = await getOrCreateWallet(prisma, user.id);
    expect(after).toMatchObject({ reservedCredits: before.reservedCredits - 1, availableCredits: before.availableCredits + 1 });

    const batch = await prisma.pitchBatch.findFirstOrThrow({ where: { id: (await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } })).batchId! } });
    expect(batch).toMatchObject({ failedCount: 1, refundedCount: 1, status: "COMPLETED" });
  });

  it("never queues a second WhatsApp message for a pipeline that already has one in flight", async () => {
    const { user, pipeline } = await recordingStage("credit-no-double-send", "AUTO");
    await connectWhatsApp(user.id);
    await readyRecording(pipeline.recordingId!);
    await onRecordingFinished(prisma, pipeline.recordingId!);

    const queued = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(queued.stage).toBe("DELIVERY_QUEUED");
    const firstMessageId = queued.whatsappMessageId!;

    // A second delivery attempt — what a duplicated recorder callback or an
    // overlapping retry does — must reuse the in-flight message, not create
    // a second one. enqueueMessage's own BullMQ dedup is keyed on the
    // message row's id, so a second row would mean a second real send.
    await prepareDelivery(prisma, pipeline.id);
    await prepareDelivery(prisma, pipeline.id);

    const messages = await prisma.whatsAppMessage.findMany({ where: { leadId: pipeline.leadId } });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.id).toBe(firstMessageId);
    const after = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(after.stage).toBe("DELIVERY_QUEUED");
    expect(after.whatsappMessageId).toBe(firstMessageId);
  });

  it("leaves the credit reserved while a failure is still retryable — no refund until the final attempt", async () => {
    const { user, pipeline } = await recordingStage("credit-retryable", "AUTO");
    const before = await getOrCreateWallet(prisma, user.id);
    // No connected WhatsApp: a retryable failure (not in NON_RETRYABLE_REASONS).
    const request = new NextRequest("http://localhost/api/internal/pipeline/recording-ready", {
      method: "POST",
      headers: { authorization: `Bearer ${JOB_SECRET}` },
      body: JSON.stringify({ recordingId: pipeline.recordingId }),
    });
    await readyRecording(pipeline.recordingId!);
    await handleRecordingReady(prisma, request, JOB_SECRET);

    const failed = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(failed.stage).toBe("FAILED");
    expect(failed.creditOutcome).toBeNull();
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject(before); // unchanged — still reserved
  });
});

describe("public preview", () => {
  it("serves published dental previews only, and hides contact details once expired", async () => {
    const { pipeline } = await recordingStage("public", "AUTO");
    const project = await prisma.websiteProject.findUniqueOrThrow({ where: { id: pipeline.websiteProjectId! } });

    const site = await getPublicSite(prisma, project.slug);
    expect(site.expired).toBe(false);
    expect(site.content.businessName).toBe("public Dental");
    expect(site.content.phone).toBeTruthy();
    expect(site.hasVideo).toBe(false);
    expect(JSON.stringify(site)).not.toContain(pipeline.campaignId);

    await readyRecording(pipeline.recordingId!);
    expect((await getPublicSite(prisma, project.slug)).hasVideo).toBe(true);

    const expired = await getPublicSite(prisma, project.slug, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    expect(expired.expired).toBe(true);
    expect(expired.content.phone).toBeUndefined();
    expect(expired.hasVideo).toBe(false);

    await expect(getPublicSite(prisma, "does-not-exist-123")).rejects.toThrow(NotFoundError);
    await expect(getPublicSite(prisma, "../../etc/passwd")).rejects.toThrow(NotFoundError);
    await prisma.websiteProject.update({ where: { id: project.id }, data: { status: "READY" } });
    await expect(getPublicSite(prisma, project.slug)).rejects.toThrow(NotFoundError);
  });
});

describe("pipeline maintenance job", () => {
  it("finishes pipelines whose recorder callback was lost, and fails stuck recordings", async () => {
    const { runPipelineMaintenanceJob, RECORDING_STUCK_MS } = await import("../jobs/pipeline-maintenance.job");

    const lost = await recordingStage("lost-callback", "DIRECT");
    await readyRecording(lost.pipeline.recordingId!);

    const stuck = await recordingStage("stuck", "DIRECT");

    const later = new Date(Date.now() + RECORDING_STUCK_MS + 60_000);
    const result = await runPipelineMaintenanceJob(prisma, later);
    expect(result.recordingsReconciled).toBeGreaterThanOrEqual(2);
    expect(result.recordingsTimedOut).toBeGreaterThanOrEqual(1);

    expect((await prisma.leadPipeline.findUniqueOrThrow({ where: { id: lost.pipeline.id } })).stage).toBe("LINK_READY");
    const failed = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: stuck.pipeline.id } });
    expect(failed.stage).toBe("FAILED");
    expect(failed.failureReason).toBe("recording_timeout");
  });

  it("abandons a pipeline stranded in SELECTED past its attempt cap, refunding its reserved credit", async () => {
    const { runPipelineMaintenanceJob, STALE_SELECTED_MS } = await import("../jobs/pipeline-maintenance.job");
    const { AUTO_RETRY_MAX_ATTEMPTS } = await import("./pipeline.service");

    const { user, campaign } = await discoveredCampaign("stale-selected", [clinic("Stale Dental")], { targetCount: 5 });
    const lead = await prisma.lead.findFirstOrThrow({ where: { campaignId: campaign.id } });
    const { deps } = fakeDeps();
    const [pipeline] = (await selectLeads(prisma, user.id, campaign.id, [lead.id], deps)).started;

    // Exactly what a crash right after reservation leaves behind: the
    // pipeline never advanced past SELECTED, its credit still reserved.
    // attempts is already at the cap, so recovery abandons rather than
    // resumes it.
    await prisma.leadPipeline.update({
      where: { id: pipeline!.id },
      data: { stage: "SELECTED", websiteProjectId: null, recordingId: null, attempts: AUTO_RETRY_MAX_ATTEMPTS - 1 },
    });
    const before = await getOrCreateWallet(prisma, user.id);
    expect(before.reservedCredits).toBe(1);

    const later = new Date(Date.now() + STALE_SELECTED_MS + 60_000);
    const result = await runPipelineMaintenanceJob(prisma, later);
    expect(result.pipelinesAbandoned).toBeGreaterThanOrEqual(1);

    const abandoned = await prisma.leadPipeline.findUniqueOrThrow({ where: { id: pipeline!.id } });
    expect(abandoned.stage).toBe("FAILED");
    expect(abandoned.failureReason).toBe("stuck_selected");
    expect(abandoned.creditOutcome).toBe("REFUNDED");
    expect(await getOrCreateWallet(prisma, user.id)).toMatchObject({
      reservedCredits: before.reservedCredits - 1,
      availableCredits: before.availableCredits + 1,
    });
  });
});

describe("demo video retention", () => {
  // Storage is swapped for an in-memory stand-in for this block, the same
  // cache lib/storage.ts reads, so deletes and signed URLs are observable.
  const g = globalThis as { objectStorage?: unknown };

  it("is downloadable until its window closes, then refused and deleted from storage", async () => {
    const deleted: string[] = [];
    const previous = g.objectStorage;
    g.objectStorage = {
      delete: async (key: string) => void deleted.push(key),
      signedGetUrl: async (key: string) => `https://storage.test/${key}`,
    };
    try {
      const { user, campaign, pipeline } = await recordingStage("video-retention", "DIRECT");
      const recordingId = pipeline.recordingId!;
      await readyRecording(recordingId);
      await onRecordingFinished(prisma, recordingId);
      const mp4 = `recordings/test/${recordingId}.mp4`;
      const poster = `recordings/test/${recordingId}.jpg`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.demoRecording.update({ where: { id: recordingId }, data: { expiresAt, posterKey: poster } });
      const project = await prisma.websiteProject.findUniqueOrThrow({ where: { id: pipeline.websiteProjectId! } });

      // Inside the window: the dashboard can play/download it and the public page links it.
      expect(await getPipelineVideoUrl(prisma, user.id, pipeline.id, { download: true })).toBe(`https://storage.test/${mp4}`);
      expect(await getPublicVideoUrl(prisma, project.slug)).toBe(`https://storage.test/${mp4}`);
      const before = (await listCampaignLeads(prisma, user.id, campaign.id)).items[0]!;
      expect(before.pipeline).toMatchObject({ videoReady: true, videoExpired: false, videoExpiresAt: expiresAt });

      // Past the deadline it is refused at once, even before the sweep runs.
      await expect(getPipelineVideoUrl(prisma, user.id, pipeline.id, { now: new Date(expiresAt.getTime() + 1000) })).rejects.toThrow(VideoExpiredError);
      await expect(getPublicVideoUrl(prisma, project.slug, new Date(expiresAt.getTime() + 1000))).rejects.toThrow(NotFoundError);

      // A sweep before the deadline leaves it alone.
      const { deleteExpiredRecordings } = await import("../jobs/pipeline-maintenance.job");
      await deleteExpiredRecordings(prisma);
      expect(deleted).not.toContain(mp4);

      // After the deadline the video and its poster are deleted and the row forgets the keys.
      await prisma.demoRecording.update({ where: { id: recordingId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await deleteExpiredRecordings(prisma)).toBeGreaterThanOrEqual(1);
      expect(deleted).toEqual(expect.arrayContaining([mp4, poster]));
      expect(await prisma.demoRecording.findUniqueOrThrow({ where: { id: recordingId } })).toMatchObject({
        storageKey: null,
        posterKey: null,
        failureReason: "expired",
      });

      await expect(getPipelineVideoUrl(prisma, user.id, pipeline.id)).rejects.toThrow(VideoExpiredError);
      await expect(getPublicVideoUrl(prisma, project.slug)).rejects.toThrow(NotFoundError);
      expect((await getPublicSite(prisma, project.slug)).hasVideo).toBe(false);
      const after = (await listCampaignLeads(prisma, user.id, campaign.id)).items[0]!;
      expect(after.pipeline).toMatchObject({ videoReady: false, videoExpired: true });
    } finally {
      g.objectStorage = previous;
    }
  });
});

describe("preview design selection", () => {
  const business = { name: "Spice House", category: "Restaurant", city: "Chennai" };

  it("picks a design at random for verticals that have several, and stores it in the content", () => {
    expect(buildPreviewContent(business, {}, { random: () => 0 }).design).toBe("classic");
    expect(buildPreviewContent(business, {}, { random: () => 0.99 }).design).toBe("studio");
    const seen = new Set(Array.from({ length: 200 }, () => buildPreviewContent(business).design));
    expect(seen).toEqual(new Set(["classic", "studio"]));
  });

  it("honours an explicit design and keeps the dental clinic on the classic layout", () => {
    expect(buildPreviewContent(business, {}, { design: "classic", random: () => 0.99 }).design).toBe("classic");
    const dental = buildPreviewContent({ name: "Smile", category: "Dentist" }, {}, { random: () => 0.99 });
    expect(dental.design).toBe("classic");
  });

  it("still accepts previously stored content that has no design", () => {
    const { design: _design, ...legacy } = buildPreviewContent(business, {}, { random: () => 0 });
    expect(dentalContentSchema.safeParse(legacy).success).toBe(true);
  });
});

describe("preview content limits", () => {
  it("keeps FAQ text built from very long names and addresses inside the schema for every template", () => {
    const business = {
      name: "Sri Venkateswara Multi-Speciality Wellness and Family Care Centre, Main Branch Opposite the New Bus Stand",
      city: "Thiruvananthapuram",
      address: `${"Door 14/2231, Near Government Higher Secondary School, ".repeat(5)}Kerala 695001`,
      phone: "+91 471 234 5678",
    };
    for (const template of PREVIEW_TEMPLATE_CODES) {
      const content = buildPreviewContent(business, {}, { template });
      expect(dentalContentSchema.safeParse(content).success).toBe(true);
      for (const faq of content.faqs) {
        expect(faq.question.length).toBeLessThanOrEqual(140);
        expect(faq.answer.length).toBeLessThanOrEqual(400);
      }
    }
  });
});
