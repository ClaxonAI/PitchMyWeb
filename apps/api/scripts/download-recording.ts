import { prisma } from "../src/lib/db/client.js";
import { ObjectStorage } from "@pitchmyweb/storage";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

async function main() {
  // Get the latest ready recording
  const rec = await prisma.demoRecording.findFirst({
    where: { status: "READY", storageKey: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: {
      websiteProject: { select: { publishedUrl: true } },
      lead: { select: { campaignId: true, business: { select: { name: true } } } },
    },
  });

  if (!rec || !rec.storageKey) {
    console.log("No ready recording found");
    return;
  }

  console.log(`Downloading recording for: ${rec.lead.business.name}`);
  console.log(`Storage key: ${rec.storageKey}`);
  console.log(`Published URL: ${rec.websiteProject?.publishedUrl}`);
  console.log(`Duration: ${rec.durationMs}ms, Size: ${(rec.sizeBytes! / 1024 / 1024).toFixed(2)} MB`);

  const storage = ObjectStorage.fromEnv();
  const videoBuffer = await storage.getBuffer(rec.storageKey);
  const posterBuffer = rec.posterKey ? await storage.getBuffer(rec.posterKey) : null;

  const outDir = path.resolve("scripts/downloads");
  await mkdir(outDir, { recursive: true });

  const videoPath = path.join(outDir, "sample-recording.mp4");
  const posterPath = path.join(outDir, "sample-poster.jpg");

  await writeFile(videoPath, videoBuffer);
  console.log(`\n✅ Video saved to: ${videoPath}`);

  if (posterBuffer) {
    await writeFile(posterPath, posterBuffer);
    console.log(`✅ Poster saved to: ${posterPath}`);
  }

  console.log(`\nOpen the video to inspect: start ${videoPath}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
