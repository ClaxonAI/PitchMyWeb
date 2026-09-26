import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { videoSeconds } from "./transcode.js";

// Records a scripted walkthrough of a preview page, as a portrait phone video
// and as a laptop-screen video: every pitch sends both, so the owner sees the
// site the way their customers will on either.
//
// The tour: hold on the hero, then glide through each [data-section] with an
// eased scroll, pausing briefly at each section so its reveal animation
// plays on camera, and finish on the closing call-to-action.

export type RecordingDevice = "phone" | "laptop";

type DeviceProfile = {
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  userAgent: string;
  /** Height of the sticky header, so a section is not scrolled under it. */
  headerOffset: number;
};

export const DEVICES: Record<RecordingDevice, DeviceProfile> = {
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 PitchMyWebRecorder",
    headerOffset: 72,
  },
  // The desktop layout at 720p landscape: what a business owner sees on a
  // laptop, and a 16:9 frame every player shows without letterboxing.
  laptop: {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 PitchMyWebRecorder",
    headerOffset: 88,
  },
};

/** The phone viewport, kept under its old name for existing callers. */
export const VIEWPORT = DEVICES.phone.viewport;

export type RecordOptions = {
  tourSeconds: number;
  navigationTimeoutMs: number;
  device?: RecordingDevice;
};

export type RawRecording = {
  webmPath: string;
  /** Seconds of blank/loading footage at the start, to trim away. */
  leadInSeconds: number;
  tourSeconds: number;
  workDir: string;
};

export class RecordingError extends Error {
  constructor(readonly reason: "navigation_timeout" | "page_error" | "render_failed", message: string) {
    super(message);
    this.name = "RecordingError";
  }
}

let sharedBrowser: Browser | undefined;

/** One Chromium per process; each recording gets its own context. */
export async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--hide-scrollbars"] });
  }
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  await sharedBrowser?.close().catch(() => undefined);
  sharedBrowser = undefined;
}

export async function recordTour(url: string, options: RecordOptions): Promise<RawRecording> {
  const device = DEVICES[options.device ?? "phone"];
  const workDir = await mkdtemp(path.join(os.tmpdir(), "pmw-rec-"));
  const browser = await getBrowser();
  const contextStartedAt = Date.now();
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
    locale: "en-IN",
    colorScheme: "light",
    reducedMotion: "no-preference",
    userAgent: device.userAgent,
    recordVideo: { dir: workDir, size: device.viewport },
  });

  // tsx/esbuild (keepNames) wraps functions in a `__name(...)` helper that
  // exists in Node but not in the page, and page.evaluate ships our function
  // source into the page. Define a no-op helper there first.
  await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((fn) => fn);" });

  const page = await context.newPage();
  let tourStartedAt = contextStartedAt;
  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: "load", timeout: options.navigationTimeoutMs });
    } catch (error) {
      throw new RecordingError("navigation_timeout", error instanceof Error ? error.message : "Navigation failed");
    }
    if (!response || !response.ok()) {
      throw new RecordingError("page_error", `Preview responded with ${response?.status() ?? "no response"}`);
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const sectionCount = await page.locator("[data-section]").count();
    if (sectionCount === 0) throw new RecordingError("render_failed", "The preview rendered no sections");
    // Chromium's screencast only captures a frame when the page repaints, and
    // a still page repaints never: the hero hold is recorded only because some
    // earlier frame is held on screen. On a busy machine that frame can be
    // missed, and the video then starts at the first scroll with the hero shot
    // gone. A 1px corner dot that changes imperceptibly every 100ms keeps
    // frames coming for the whole recording (0 frames in a 2.5s hold without
    // it, 25 with it).
    await page.evaluate(() => {
      const dot = document.createElement("div");
      dot.setAttribute("aria-hidden", "true");
      dot.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;pointer-events:none;z-index:2147483647;background:rgba(0,0,0,0.01)";
      document.documentElement.appendChild(dot);
      let on = false;
      setInterval(() => {
        on = !on;
        dot.style.background = on ? "rgba(0,0,0,0.02)" : "rgba(0,0,0,0.01)";
      }, 100);
    });
    // Let above-the-fold reveals settle before the tour starts.
    await page.waitForTimeout(900);
    tourStartedAt = Date.now();

    await page.evaluate(
      async ({ tourMs, headerOffset }) => {
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const glide = (to: number, ms: number) =>
          new Promise<void>((resolve) => {
            const from = window.scrollY;
            const start = performance.now();
            const step = (now: number) => {
              const t = Math.min(1, (now - start) / ms);
              window.scrollTo(0, from + (to - from) * ease(t));
              if (t < 1) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          });

        document.documentElement.style.scrollBehavior = "auto";
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-section]")).slice(1);
        const targets = sections.map((section) => Math.min(maxScroll, Math.max(0, section.getBoundingClientRect().top + window.scrollY - headerOffset)));

        const heroHold = 2500;
        const endHold = 2000;
        const pause = 450;
        const travelBudget = Math.max(3000, tourMs - heroHold - endHold - pause * targets.length);

        // Travel time per leg is proportional to distance, so tall sections
        // scroll at the same comfortable pace as short ones.
        const distances = targets.map((target, i) => Math.abs(target - (i === 0 ? 0 : targets[i - 1]!)));
        const total = distances.reduce((sum, d) => sum + d, 0) || 1;

        await sleep(heroHold);
        for (let i = 0; i < targets.length; i += 1) {
          const legMs = Math.max(500, (distances[i]! / total) * travelBudget);
          // Long legs scroll in two steps so content is readable on the way.
          if (distances[i]! > window.innerHeight * 1.2) {
            const mid = (i === 0 ? 0 : targets[i - 1]!) + (targets[i]! - (i === 0 ? 0 : targets[i - 1]!)) / 2;
            await glide(mid, legMs / 2);
            await sleep(pause / 2);
            await glide(targets[i]!, legMs / 2);
          } else {
            await glide(targets[i]!, legMs);
          }
          await sleep(pause);
        }
        await sleep(endHold);
      },
      { tourMs: options.tourSeconds * 1000, headerOffset: device.headerOffset },
    );
  } catch (error) {
    await context.close().catch(() => undefined);
    await rm(workDir, { recursive: true, force: true });
    if (error instanceof RecordingError) throw error;
    throw new RecordingError("render_failed", error instanceof Error ? error.message : "Recording failed");
  }

  const closedAt = Date.now();
  const tourSeconds = (closedAt - tourStartedAt) / 1000;
  const video = page.video();
  await context.close();
  const webmPath = video ? await video.path() : null;
  if (!webmPath) {
    await rm(workDir, { recursive: true, force: true });
    throw new RecordingError("render_failed", "Playwright produced no video");
  }

  const webmSeconds = await videoSeconds(webmPath).catch(() => 0);
  return {
    webmPath,
    leadInSeconds: leadInSeconds({ contextStartedAt, tourStartedAt, closedAt, webmSeconds }),
    tourSeconds,
    workDir,
  };
}

/** Footage kept before the tour's first frame. */
const LEAD_IN_KEEP_SECONDS = 0.35;
/** How far past the context closing Playwright may run the video (see below). */
const VIDEO_END_SLACK_SECONDS = 1;

/**
 * Where the tour starts in the raw video: the blank/loading footage to trim.
 *
 * The video's clock starts at its first captured frame, which this code
 * cannot observe: it follows context and page creation and, on a busy
 * machine, can lag them by seconds (3.3 s on a CI runner, which cut that much
 * of the hero shot). The end is observable: Playwright ends the video when
 * the context closes, or up to a second later if frames were still arriving
 * (always, since the corner dot above keeps them coming). So the start is found from the end,
 * allowing that second, which errs towards keeping a moment of the settled
 * hero rather than cutting into the tour. The context's creation is always
 * before the first frame, so measuring from it bounds the trim from above,
 * and is the estimate when the video's duration cannot be read.
 */
export function leadInSeconds(t: { contextStartedAt: number; tourStartedAt: number; closedAt: number; webmSeconds: number }): number {
  const atMost = Math.max(0, (t.tourStartedAt - t.contextStartedAt) / 1000 - LEAD_IN_KEEP_SECONDS);
  if (!(t.webmSeconds > 0)) return atMost;
  const fromEnd = t.webmSeconds - (t.closedAt - t.tourStartedAt) / 1000 - VIDEO_END_SLACK_SECONDS - LEAD_IN_KEEP_SECONDS;
  return Math.min(atMost, Math.max(0, fromEnd));
}
