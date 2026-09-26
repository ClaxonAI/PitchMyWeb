import { describe, expect, it, vi } from "vitest";
import type { WhatsAppProvider } from "../providers/whatsapp.provider.js";
import { deliverMessage, MAX_VIDEO_BYTES, MediaUnavailableError, type DeliverableMessage, type MediaSource } from "./deliver.js";
import { OperationTimeoutError } from "./with-timeout.js";

function provider(overrides: Partial<WhatsAppProvider> = {}): WhatsAppProvider {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatus: vi.fn(() => "CONNECTED" as const),
    checkNumber: vi.fn(async () => ({ exists: true })),
    sendText: vi.fn(async () => ({ providerMessageId: "text-1" })),
    sendVideo: vi.fn(async () => ({ providerMessageId: "video-1" })),
    ...overrides,
  } as WhatsAppProvider;
}

const text: DeliverableMessage = {
  accountId: "acc",
  phoneNumber: "919876543210",
  body: "Hello",
  mediaKind: null,
  mediaStorageKey: null,
  mediaMimeType: null,
};
const video: DeliverableMessage = { ...text, body: "Your site: https://p.example/s/x", mediaKind: "VIDEO", mediaStorageKey: "recordings/c/r.mp4", mediaMimeType: "video/mp4" };
const timeouts = { textMs: 1000, mediaMs: 1000 };

const store = (data: Buffer): MediaSource & { getBuffer: ReturnType<typeof vi.fn> } => ({ getBuffer: vi.fn(async () => data) });

describe("deliverMessage", () => {
  it("sends text messages as text and never touches storage", async () => {
    const p = provider();
    const media = store(Buffer.from("x"));
    await expect(deliverMessage(p, media, text, timeouts)).resolves.toEqual({ providerMessageId: "text-1", secondary: null });
    expect(p.sendText).toHaveBeenCalledWith("acc", "919876543210", "Hello");
    expect(media.getBuffer).not.toHaveBeenCalled();
  });

  it("sends a video with the body as caption", async () => {
    const p = provider();
    const media = store(Buffer.from("mp4-bytes"));
    await expect(deliverMessage(p, media, video, timeouts)).resolves.toEqual({ providerMessageId: "video-1", secondary: null });
    expect(media.getBuffer).toHaveBeenCalledWith("recordings/c/r.mp4");
    expect(p.sendVideo).toHaveBeenCalledWith("acc", "919876543210", {
      data: Buffer.from("mp4-bytes"),
      mimetype: "video/mp4",
      caption: video.body,
    });
    expect(p.sendText).not.toHaveBeenCalled();
  });

  it("fails with a fixed reason when storage is missing, the file is missing/empty, or too large", async () => {
    const p = provider();
    await expect(deliverMessage(p, null, video, timeouts)).rejects.toMatchObject({ reason: "media_storage_unconfigured" });
    await expect(deliverMessage(p, store(Buffer.from("x")), { ...video, mediaStorageKey: null }, timeouts)).rejects.toMatchObject({ reason: "media_missing" });
    const failing: MediaSource = { getBuffer: async () => { throw new Error("NoSuchKey"); } };
    await expect(deliverMessage(p, failing, video, timeouts)).rejects.toMatchObject({ reason: "media_missing" });
    await expect(deliverMessage(p, store(Buffer.alloc(0)), video, timeouts)).rejects.toBeInstanceOf(MediaUnavailableError);
    await expect(deliverMessage(p, store(Buffer.alloc(MAX_VIDEO_BYTES + 1)), video, timeouts)).rejects.toMatchObject({ reason: "media_too_large" });
    expect(p.sendVideo).not.toHaveBeenCalled();
  });

  const twoVideos: DeliverableMessage = {
    ...video,
    secondaryMediaStorageKey: "recordings/c/r-laptop.mp4",
    secondaryMediaMimeType: "video/mp4",
    secondaryCaption: "And here is the same site on a laptop screen.",
  };

  it("sends the laptop video right after the phone video, and reports the first send's id", async () => {
    const sendVideo = vi.fn().mockResolvedValueOnce({ providerMessageId: "phone-1" }).mockResolvedValueOnce({ providerMessageId: "laptop-1" });
    const p = provider({ sendVideo });
    const media: MediaSource = { getBuffer: vi.fn(async (key: string) => Buffer.from(key)) };

    await expect(deliverMessage(p, media, twoVideos, timeouts)).resolves.toEqual({ providerMessageId: "phone-1", secondary: { sent: true } });
    expect(sendVideo).toHaveBeenNthCalledWith(1, "acc", "919876543210", { data: Buffer.from("recordings/c/r.mp4"), mimetype: "video/mp4", caption: video.body });
    expect(sendVideo).toHaveBeenNthCalledWith(2, "acc", "919876543210", {
      data: Buffer.from("recordings/c/r-laptop.mp4"),
      mimetype: "video/mp4",
      caption: "And here is the same site on a laptop screen.",
    });
  });

  it("keeps the message sent when only the laptop video fails, instead of re-sending the pitch", async () => {
    const sendVideo = vi.fn().mockResolvedValueOnce({ providerMessageId: "phone-1" }).mockRejectedValueOnce(new Error("upload failed"));
    const p = provider({ sendVideo });
    await expect(deliverMessage(p, store(Buffer.from("x")), twoVideos, timeouts)).resolves.toEqual({
      providerMessageId: "phone-1",
      secondary: { sent: false, reason: "Error" },
    });
  });

  it("never sends the laptop video when the phone video fails", async () => {
    const sendVideo = vi.fn().mockRejectedValueOnce(new Error("rejected"));
    const p = provider({ sendVideo });
    await expect(deliverMessage(p, store(Buffer.from("x")), twoVideos, timeouts)).rejects.toThrow("rejected");
    expect(sendVideo).toHaveBeenCalledTimes(1);
  });

  it("bounds a hung video send with its own timeout", async () => {
    const p = provider({ sendVideo: vi.fn(() => new Promise<never>(() => undefined)) });
    await expect(deliverMessage(p, store(Buffer.from("x")), video, { textMs: 5000, mediaMs: 30 })).rejects.toBeInstanceOf(OperationTimeoutError);
  });
});
