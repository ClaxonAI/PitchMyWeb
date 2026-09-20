import { chromium, type Browser } from "playwright";

// One shared Chromium per process, same idiom as apps/recorder-worker's
// getBrowser()/closeBrowser() — a fresh context+page per job, but the
// (expensive) browser process itself is reused across jobs.

let sharedBrowser: Browser | undefined;

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
