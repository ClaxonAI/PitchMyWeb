/**
 * Re-records one site using the FIXED record.ts and saves the result locally.
 * Run: npx tsx scripts/verify-recording-fix.ts
 */
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { recordTour } from "../../../apps/recorder-worker/src/record.js";
import { transcodeToMp4 } from "../../../apps/recorder-worker/src/transcode.js";

const PREVIEW_URL = "http://localhost:3200/s/hustle-hub-gym-63a01e39";

async function main() {
  console.log(`\n🎬 Recording: ${PREVIEW_URL}`);
  console.log("This takes ~25 seconds...\n");

  const raw = await recordTour(PREVIEW_URL, {
    tourSeconds: 22,
    navigationTimeoutMs: 45_000,
  });

  console.log(`✅ Raw recording captured: ${raw.webmPath}`);
  console.log(`   Lead-in: ${raw.leadInSeconds.toFixed(2)}s, Tour: ${raw.tourSeconds.toFixed(2)}s`);

  const video = await transcodeToMp4(raw.webmPath, raw.workDir, raw.leadInSeconds);
  console.log(`✅ Transcoded: ${video.width}x${video.height}, ${(video.mp4.byteLength / 1024 / 1024).toFixed(2)} MB, ${video.durationMs}ms`);

  const outDir = path.resolve("scripts/downloads");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "fixed-recording.mp4");
  const posterPath = path.join(outDir, "fixed-poster.jpg");

  await writeFile(outPath, video.mp4);
  await writeFile(posterPath, video.poster);

  await rm(raw.workDir, { recursive: true, force: true });

  console.log(`\n📁 Saved to:`);
  console.log(`   Video:  ${outPath}`);
  console.log(`   Poster: ${posterPath}`);
  console.log(`\nOpening...`);
}

main().catch(console.error);
