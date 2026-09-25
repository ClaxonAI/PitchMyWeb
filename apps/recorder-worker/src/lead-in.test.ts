import { describe, expect, it } from "vitest";
import { leadInSeconds } from "./record.js";

// Times in ms on one clock: the context is created at 0, the tour runs from
// 2s to 12s, and the context closes at 12s.
const base = { contextStartedAt: 0, tourStartedAt: 2_000, closedAt: 12_000 };

describe("leadInSeconds", () => {
  it("locates the tour from the video's end, keeping a moment of the hero", () => {
    // The first frame came 1.5s in: 10.5s of video, the tour starts at 0.5s.
    // The trim keeps up to the one-second end allowance plus 0.35s before it.
    expect(leadInSeconds({ ...base, webmSeconds: 10.5 })).toBe(0);
    // Slow page load: 14s of video, the tour starts 4s in.
    expect(leadInSeconds({ ...base, tourStartedAt: 4_000, closedAt: 14_000, webmSeconds: 14 })).toBeCloseTo(2.65);
  });

  it("never trims into the tour when the video started late", () => {
    // A busy machine: the first frame 1.8s after the context was created, so
    // the video is 10.2s and the tour starts 0.2s in. Measuring from the
    // context's creation would cut 1.65s of the tour.
    const trim = leadInSeconds({ ...base, webmSeconds: 10.2 });
    expect(trim).toBeLessThanOrEqual(0.2);
  });

  it("never trims more than the time since the context was created", () => {
    // Frames still arriving at the end made the video a second longer.
    expect(leadInSeconds({ ...base, webmSeconds: 13.2 })).toBeLessThanOrEqual(2 - 0.35);
  });

  it("falls back to the context's creation when the duration is unreadable", () => {
    expect(leadInSeconds({ ...base, webmSeconds: 0 })).toBeCloseTo(1.65);
    expect(leadInSeconds({ ...base, webmSeconds: Number.NaN })).toBeCloseTo(1.65);
  });
});
