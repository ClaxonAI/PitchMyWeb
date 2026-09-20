import type { WhatsAppMessage } from "@pitchmyweb/db";
import type { SendTextResult, WhatsAppProvider } from "../providers/whatsapp.provider.js";
import { withTimeout } from "./with-timeout.js";

// The provider call for one claimed message: plain text, or a video with the
// body as its caption. Called by send.worker only AFTER the QUEUED -> SENDING
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
>;

export async function deliverMessage(
  provider: WhatsAppProvider,
  media: MediaSource | null,
  message: DeliverableMessage,
  timeouts: DeliverTimeouts,
): Promise<SendTextResult> {
  if (message.mediaKind !== "VIDEO") {
    return withTimeout("sendText", timeouts.textMs, () => provider.sendText(message.accountId, message.phoneNumber, message.body));
  }

  if (!media) throw new MediaUnavailableError("media_storage_unconfigured");
  if (!message.mediaStorageKey) throw new MediaUnavailableError("media_missing");

  // One budget covers download and upload: together they are "the send".
  return withTimeout("sendVideo", timeouts.mediaMs, async () => {
    let data: Buffer;
    try {
      data = await media.getBuffer(message.mediaStorageKey!);
    } catch {
      throw new MediaUnavailableError("media_missing");
    }
    if (data.byteLength === 0) throw new MediaUnavailableError("media_missing");
    if (data.byteLength > MAX_VIDEO_BYTES) throw new MediaUnavailableError("media_too_large");
    return provider.sendVideo(message.accountId, message.phoneNumber, {
      data,
      mimetype: message.mediaMimeType ?? "video/mp4",
      caption: message.body,
    });
  });
}
