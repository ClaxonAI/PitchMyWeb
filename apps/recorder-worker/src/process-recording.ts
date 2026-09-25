import { rm } from "node:fs/promises";
import type { PrismaClient } from "@pitchmyweb/db";
import { storageKeys, videoExpiry } from "@pitchmyweb/storage";
import { RecordingError, recordTour } from "./record.js";
import { TranscodeError, transcodeToMp4 } from "./transcode.js";
import { assertPreviewUrl, UrlNotAllowedError } from "./url-guard.js";

// One recording job, end to end:
//   load -> SSRF check -> RECORDING -> record -> MP4 -> upload -> READY -> notify API
//
// Failure handling: a retryable failure returns the row to QUEUED and
// rethrows so BullMQ retries it; the final attempt marks it FAILED with a
// fixed reason code and notifies the API, which fails the lead's pipeline.

export type Uploader = {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
};

export type ProcessDeps = {
  db: PrismaClient;
  storage: Uploader;
  sitesPublicUrl: string;
  tourSeconds: number;
  navigationTimeoutMs: number;
  notify: (recordingId: string) => Promise<void>;
  log: (level: "info" | "warn" | "error", fields: Record<string, unknown>, message: string) => void;
};

export type ProcessOutcome = "ready" | "failed" | "skipped";

function failureReason(error: unknown): string {
  if (error instanceof UrlNotAllowedError) return "url_not_allowed";
  if (error instanceof RecordingError) return error.reason;
  if (error instanceof TranscodeError) return "transcode_failed";
  if (error instanceof UploadError) return "upload_failed";
  return "recording_failed";
}

class UploadError extends Error {}

/** URL errors will never succeed on retry. */
function isPermanent(error: unknown): boolean {
  return error instanceof UrlNotAllowedError;
}

export async function processRecording(
  deps: ProcessDeps,
  recordingId: string,
  attempt: { number: number; max: number },
): Promise<ProcessOutcome> {
  const { db } = deps;
  const recording = await db.demoRecording.findUnique({
    where: { id: recordingId },
    include: {
      websiteProject: { select: { publishedUrl: true, status: true, expiresAt: true } },
      lead: { select: { campaignId: true } },
    },
  });
  if (!recording) {
    deps.log("warn", { recordingId }, "recording no longer exists");
    return "skipped";
  }
  if (recording.status === "READY" || recording.status === "FAILED") {
    // Already resolved (duplicate job): make sure the API heard about it.
    await deps.notify(recordingId).catch(() => undefined);
    return "skipped";
  }

  let workDir: string | undefined;
  try {
    if (recording.websiteProject.status !== "PUBLISHED") throw new UrlNotAllowedError();
    const url = assertPreviewUrl(recording.websiteProject.publishedUrl, deps.sitesPublicUrl);

    await db.demoRecording.update({
      where: { id: recordingId },
      data: { status: "RECORDING", attempts: { increment: 1 } },
    });

    const raw = await recordTour(url.toString(), { tourSeconds: deps.tourSeconds, navigationTimeoutMs: deps.navigationTimeoutMs });
    workDir = raw.workDir;
    const video = await transcodeToMp4(raw.webmPath, raw.workDir, raw.leadInSeconds);

    const storageKey = storageKeys.recording(recording.lead.campaignId, recordingId);
    const posterKey = storageKeys.poster(recording.lead.campaignId, recordingId);
    try {
      await deps.storage.put(storageKey, video.mp4, "video/mp4");
      await deps.storage.put(posterKey, video.poster, "image/jpeg");
    } catch (error) {
      throw new UploadError(error instanceof Error ? error.message : "Upload failed");
    }

    await db.demoRecording.update({
      where: { id: recordingId },
      data: {
        status: "READY",
        storageKey,
        posterKey,
        durationMs: video.durationMs,
        sizeBytes: video.mp4.byteLength,
        mimeType: "video/mp4",
        failureReason: null,
        // Downloadable for VIDEO_RETENTION_DAYS; the API's maintenance job
        // deletes the objects after this.
        expiresAt: videoExpiry(),
      },
    });
    deps.log("info", { recordingId, durationMs: video.durationMs, sizeBytes: video.mp4.byteLength, width: video.width, height: video.height }, "recording ready");
    await deps.notify(recordingId);
    return "ready";
  } catch (error) {
    const reason = failureReason(error);
    const final = isPermanent(error) || attempt.number >= attempt.max;
    deps.log(final ? "error" : "warn", { recordingId, reason, attempt: attempt.number, err: error instanceof Error ? error.message.slice(0, 200) : String(error) }, "recording attempt failed");

    await db.demoRecording.update({
      where: { id: recordingId },
      data: final ? { status: "FAILED", failureReason: reason } : { status: "QUEUED", failureReason: reason },
    });
    if (!final) throw error;
    await deps.notify(recordingId);
    return "failed";
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** POSTs the recording-ready callback to the API, with a short retry. */
export function apiNotifier(apiUrl: string, secret: string, fetchImpl: typeof fetch = fetch) {
  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/internal/pipeline/recording-ready`;
  return async (recordingId: string): Promise<void> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
          body: JSON.stringify({ recordingId }),
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) return;
        lastError = new Error(`API responded ${response.status}`);
        if (response.status < 500) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    // The API maintenance job reconciles recordings whose callback was lost.
    throw lastError instanceof Error ? lastError : new Error("Callback failed");
  };
}
