import type { WhatsAppMessage } from "@pitchmyweb/db";
import type { SendTextResult, WhatsAppProvider } from "../providers/whatsapp.provider.js";
import { withTimeout } from "./with-timeout.js";

// The provider call for one claimed message: plain text, or a video with the
// body as its caption, optionally followed by a second video (the laptop
// walkthrough after the phone one). Called by send.worker only AFTER the QUEUED -> SENDING
// claim, so the attachment is read at most once per real send attempt.

/** WhatsApp auto-downloads videos up to 16 MB; the recorder targets far less. */
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

/** Where attachments are read from (object storage in production). */
export type MediaSource = {
  getBuffer(key: string): Promise<Buffer>;
};

/** An attachment problem that is not WhatsApp's fault. `reason` is a fixed code. */
export class MediaUnavailableError extends Error {
  constructor(readonly reason: "media_storage_unconfigured" | "media_missing" | "media_too_large") {
    super(reason);
    this.name = "MediaUnavailableError";
  }
}

export type DeliverTimeouts = { textMs: number; mediaMs: number };

export type DeliverableMessage = Pick<
  WhatsAppMessage,
  "accountId" | "phoneNumber" | "body" | "mediaKind" | "mediaStorageKey" | "mediaMimeType"
> &
  Partial<Pick<WhatsAppMessage, "secondaryMediaStorageKey" | "secondaryMediaMimeType" | "secondaryCaption">>;

/**
 * What happened to the second video, when there was one. The first send is
 * the message: its id is what delivery receipts match, and once it has gone
 * the row is SENT whatever happens here, because retrying would send the
 * pitch to the business a second time.
 */
export type SecondaryOutcome = { sent: true } | { sent: false; reason: string } | null;

export type DeliverResult = SendTextResult & { secondary: SecondaryOutcome };

async function sendStoredVideo(
  provider: WhatsAppProvider,
  media: MediaSource | null,
  message: Pick<WhatsAppMessage, "accountId" | "phoneNumber">,
  video: { storageKey: string | null; mimeType: string | null; caption: string },
  timeoutMs: number,
): Promise<SendTextResult> {
  if (!media) throw new MediaUnavailableError("media_storage_unconfigured");
  if (!video.storageKey) throw new MediaUnavailableError("media_missing");

  // One budget covers download and upload: together they are "the send".
  return withTimeout("sendVideo", timeoutMs, async () => {
    let data: Buffer;
    try {
      data = await media.getBuffer(video.storageKey!);
    } catch {
      throw new MediaUnavailableError("media_missing");
    }
    if (data.byteLength === 0) throw new MediaUnavailableError("media_missing");
    if (data.byteLength > MAX_VIDEO_BYTES) throw new MediaUnavailableError("media_too_large");
    return provider.sendVideo(message.accountId, message.phoneNumber, {
      data,
      mimetype: video.mimeType ?? "video/mp4",
      caption: video.caption,
    });
  });
}

export async function deliverMessage(
  provider: WhatsAppProvider,
  media: MediaSource | null,
  message: DeliverableMessage,
  timeouts: DeliverTimeouts,
): Promise<DeliverResult> {
  if (message.mediaKind !== "VIDEO") {
    const sent = await withTimeout("sendText", timeouts.textMs, () => provider.sendText(message.accountId, message.phoneNumber, message.body));
    return { ...sent, secondary: null };
  }

  const primary = await sendStoredVideo(
    provider,
    media,
    message,
    { storageKey: message.mediaStorageKey, mimeType: message.mediaMimeType, caption: message.body },
    timeouts.mediaMs,
  );
  if (!message.secondaryMediaStorageKey) return { ...primary, secondary: null };

  try {
    await sendStoredVideo(
      provider,
      media,
      message,
      { storageKey: message.secondaryMediaStorageKey, mimeType: message.secondaryMediaMimeType ?? null, caption: message.secondaryCaption ?? "" },
      timeouts.mediaMs,
    );
    return { ...primary, secondary: { sent: true } };
  } catch (error) {
    const reason = error instanceof MediaUnavailableError ? error.reason : error instanceof Error ? error.name : "unknown";
    return { ...primary, secondary: { sent: false, reason } };
  }
}
