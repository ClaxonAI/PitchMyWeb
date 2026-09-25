import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@pitchmyweb/db";
import { getConfig } from "./config.js";
import { processRecording, type ProcessDeps } from "./process-recording.js";
import { closeBrowser, recordTour } from "./record.js";
import { MAX_MP4_BYTES, transcodeToMp4 } from "./transcode.js";

// Real Chromium, real ffmpeg, real Postgres. A tiny local server plays the
// part of apps/sites so the test needs no other app running.

const section = (name: string, color: string, height: number) =>
  `<section data-section="${name}" style="height:${height}px;background:${color};display:grid;place-items:center;font:600 28px system-ui;color:#fff">${name}</section>`;

const FIXTURE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture clinic</title></head>
<body style="margin:0">
${section("hero", "#0f5c57", 820)}
${section("services", "#3d6a4f", 1400)}
${section("visit", "#1f3d66", 700)}
${section("cta", "#e39266", 600)}
</body></html>`;

let server: Server;
let origin: string;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: getConfig().DATABASE_URL, max: 2 }) });
const userIds: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith("/s/")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(FIXTURE);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await closeBrowser();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.business.deleteMany({ where: { source: "recorder:test" } });
  await db.$disconnect();
});

describe("recordTour + transcodeToMp4", () => {
  it("produces a portrait H.264 MP4 within the WhatsApp budget, plus a poster", async () => {
    const raw = await recordTour(`${origin}/s/fixture-clinic`, { tourSeconds: 10, navigationTimeoutMs: 20_000 });
    try {
      expect(raw.tourSeconds).toBeGreaterThanOrEqual(9);
      const video = await transcodeToMp4(raw.webmPath, raw.workDir, raw.leadInSeconds);
      expect(video.codec).toBe("h264");
      expect(video.width).toBe(720);
      expect(video.height).toBeGreaterThan(video.width);
      expect(video.width % 2).toBe(0);
      expect(video.height % 2).toBe(0);
      expect(video.durationMs).toBeGreaterThan(8_000);
      expect(video.durationMs).toBeLessThan(20_000);
      expect(video.mp4.byteLength).toBeGreaterThan(10_000);
      expect(video.mp4.byteLength).toBeLessThanOrEqual(MAX_MP4_BYTES);
      // MP4 "ftyp" box, and moov before mdat (+faststart) so phones can stream it.
      expect(video.mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
      expect(video.mp4.indexOf("moov")).toBeLessThan(video.mp4.indexOf("mdat"));
      expect(video.poster.subarray(0, 2).toString("hex")).toBe("ffd8");
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(raw.workDir, { recursive: true, force: true });
    }
  });
});

async function seedRecording(publishedUrl: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await db.user.create({ data: { email: `recorder-${suffix}@example.test`, passwordHash: "x" } });
  userIds.push(user.id);
  const campaign = await db.campaign.create({
    data: { userId: user.id, name: "rec", location: "Chennai", category: "Dental Clinic", leadLimit: 1, status: "COMPLETED" },
  });
  const business = await db.business.create({
    data: { name: "Fixture Clinic", category: "Dental Clinic", source: "recorder:test", externalId: suffix },
  });
  const lead = await db.lead.create({ data: { campaignId: campaign.id, businessId: business.id } });
  const project = await db.websiteProject.create({
    data: { leadId: lead.id, template: "dental-clinic", contentJSON: {}, slug: `fixture-clinic-${suffix}`, status: "PUBLISHED", publishedUrl },
  });
  const recording = await db.demoRecording.create({ data: { websiteProjectId: project.id, leadId: lead.id } });
  return { campaign, recording };
}

function deps(overrides: Partial<ProcessDeps> = {}) {
  const put = vi.fn(async (_key: string, _body: Buffer, _contentType: string) => undefined);
  const notify = vi.fn(async (_recordingId: string) => undefined);
  const value: ProcessDeps = {
    db,
    storage: { put },
    sitesPublicUrl: origin,
    tourSeconds: 8,
    navigationTimeoutMs: 20_000,
    notify,
    log: () => undefined,
    ...overrides,
  };
  return { value, put, notify };
}

describe("processRecording", () => {
  it("records, uploads and marks the recording READY, then notifies the API", async () => {
    const { campaign, recording } = await seedRecording(`${origin}/s/fixture-clinic`);
    const { value, put, notify } = deps();

    await expect(processRecording(value, recording.id, { number: 1, max: 2 })).resolves.toBe("ready");

    const row = await db.demoRecording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(row.status).toBe("READY");
    expect(row.storageKey).toBe(`recordings/${campaign.id}/${recording.id}.mp4`);
    expect(row.mimeType).toBe("video/mp4");
    expect(row.sizeBytes).toBeGreaterThan(0);
    expect(row.attempts).toBe(1);
    // Downloadable for the default 7 days, then cleaned out of storage.
    const days = (row.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[0]?.[2]).toBe("video/mp4");
    expect(notify).toHaveBeenCalledWith(recording.id);

    // A duplicate job is a no-op that re-sends the callback.
    await expect(processRecording(value, recording.id, { number: 1, max: 2 })).resolves.toBe("skipped");
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("refuses URLs outside the preview origin without retrying", async () => {
    const { recording } = await seedRecording("http://169.254.169.254/s/metadata");
    const { value, put, notify } = deps();

    await expect(processRecording(value, recording.id, { number: 1, max: 3 })).resolves.toBe("failed");
    const row = await db.demoRecording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(row.status).toBe("FAILED");
    expect(row.failureReason).toBe("url_not_allowed");
    expect(put).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(recording.id);
  });

  it("returns a failed attempt to QUEUED for retry, and fails it on the last attempt", async () => {
    const { recording } = await seedRecording(`${origin}/s/fixture-clinic`);
    const failingUpload = { put: vi.fn(async () => { throw new Error("bucket unavailable"); }) };
    const { value, notify } = deps({ storage: failingUpload, tourSeconds: 8 });

    await expect(processRecording(value, recording.id, { number: 1, max: 2 })).rejects.toThrow();
    let row = await db.demoRecording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(row.status).toBe("QUEUED");
    expect(row.failureReason).toBe("upload_failed");
    expect(notify).not.toHaveBeenCalled();

    await expect(processRecording(value, recording.id, { number: 2, max: 2 })).resolves.toBe("failed");
    row = await db.demoRecording.findUniqueOrThrow({ where: { id: recording.id } });
    expect(row.status).toBe("FAILED");
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
