import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

// WebM from Playwright -> MP4 that WhatsApp plays inline on every phone:
// H.264 (yuv420p, even dimensions), faststart, no audio track, small. The
// laptop recording comes out 720p landscape, the phone one 720-wide portrait.

export const MAX_MP4_BYTES = 8 * 1024 * 1024;
/** Phone recordings are scaled to this width; laptop ones keep their 1280. */
export const PHONE_OUTPUT_WIDTH = 720;
export const LAPTOP_OUTPUT_WIDTH = 1280;

export class TranscodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscodeError";
  }
}

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => reject(new TranscodeError(error.message)));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new TranscodeError(`${path.basename(binary)} exited with ${code}: ${stderr.split("\n").filter(Boolean).slice(-2).join(" | ")}`));
    });
  });
}

async function encode(input: string, output: string, trimSeconds: number, crf: number, width: number): Promise<void> {
  await run(ffmpegInstaller.path, [
    "-y",
    "-ss",
    trimSeconds.toFixed(2),
    "-i",
    input,
    "-vf",
    `scale=${width}:-2:flags=lanczos,fps=30,format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-crf",
    String(crf),
    "-movflags",
    "+faststart",
    "-an",
    output,
  ]);
}

export type EncodedVideo = {
  mp4: Buffer;
  poster: Buffer;
  durationMs: number;
  width: number;
  height: number;
  codec: string;
};

export async function probe(file: string): Promise<{ durationMs: number; width: number; height: number; codec: string }> {
  const out = await run(ffprobeInstaller.path, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height:format=duration",
    "-of",
    "json",
    file,
  ]);
  const parsed = JSON.parse(out) as { streams?: { codec_name?: string; width?: number; height?: number }[]; format?: { duration?: string } };
  const stream = parsed.streams?.[0];
  return {
    durationMs: Math.round(Number(parsed.format?.duration ?? 0) * 1000),
    width: stream?.width ?? 0,
    height: stream?.height ?? 0,
    codec: stream?.codec_name ?? "unknown",
  };
}

export async function transcodeToMp4(
  webmPath: string,
  workDir: string,
  trimSeconds: number,
  options: { width?: number; name?: string } = {},
): Promise<EncodedVideo> {
  const width = options.width ?? PHONE_OUTPUT_WIDTH;
  const name = options.name ?? "walkthrough";
  const mp4Path = path.join(workDir, `${name}.mp4`);
  const posterPath = path.join(workDir, `${name}.jpg`);

  // Try a quality setting first, then a smaller one if the file is too big.
  for (const crf of [26, 31, 35]) {
    await encode(webmPath, mp4Path, trimSeconds, crf, width);
    if ((await stat(mp4Path)).size <= MAX_MP4_BYTES) break;
    if (crf === 35) throw new TranscodeError("Encoded video is larger than the WhatsApp budget");
  }

  await run(ffmpegInstaller.path, ["-y", "-ss", "1.2", "-i", mp4Path, "-frames:v", "1", "-vf", `scale=${width > PHONE_OUTPUT_WIDTH ? 960 : 540}:-2`, "-q:v", "4", posterPath]);

  const info = await probe(mp4Path);
  return {
    mp4: await readFile(mp4Path),
    poster: await readFile(posterPath),
    ...info,
  };
}
