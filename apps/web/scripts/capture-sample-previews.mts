// Regenerates public/samples/*.webp, the screenshots the marketing page shows
// for each sample site (see samplePreviewImage in src/data/sampleSites.ts).
// Run it after changing a template or the sample list:
//
//   NEXT_PUBLIC_SITES_URL=https://preview.pitchmyweb.in npx tsx apps/web/scripts/capture-sample-previews.mts
//
// Uses the monorepo's playwright (apps/recorder-worker) and sharp (next).
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { sampleDemoUrl, samplePreviewImage, sampleSites } from "../src/data/sampleSites";

// The cards are 5:4. The demo is captured at 1120px wide so the card shows
// the site's desktop layout, as the old half-scale iframe did.
const VIEWPORT = { width: 1120, height: 896 };
const OUTPUT_WIDTH = 800;

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

const browser = await chromium.launch();
try {
  for (const site of sampleSites) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const url = sampleDemoUrl(site, true);
    const response = await page.goto(url, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`${url} answered ${response?.status()}`);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(400);
    const png = await page.screenshot();
    const file = path.join(publicDir, samplePreviewImage(site));
    await mkdir(path.dirname(file), { recursive: true });
    const { size } = await sharp(png).resize({ width: OUTPUT_WIDTH }).webp({ quality: 74, effort: 6 }).toFile(file);
    console.log(`${path.relative(publicDir, file)}  ${Math.round(size / 1024)} KB  ← ${url}`);
    await page.close();
  }
} finally {
  await browser.close();
}
