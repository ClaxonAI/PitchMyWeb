import type { PrismaClient } from "@pitchmyweb/db";
import { dentalContentSchema, isPreviewTemplate, type DentalContent } from "@pitchmyweb/templates";
import { NotFoundError } from "../errors";
import { getObjectStorage, RECORDING_URL_TTL_SECONDS } from "../storage";

// What the public preview app (apps/sites) may read. Only published
// preview templates, only the template content (which holds nothing but
// public business facts), and nothing about the user, the campaign or the
// lead's pipeline.

const SLUG_PATTERN = /^[a-z0-9-]{3,80}$/;

export type PublicSite = {
  slug: string;
  template: DentalContent["template"];
  content: DentalContent;
  expired: boolean;
  expiresAt: string | null;
  hasVideo: boolean;
  /** A laptop-size walkthrough exists too (recordings made before it did have only the phone one). */
  hasLaptopVideo: boolean;
};

async function loadPublishedProject(db: PrismaClient, slug: string) {
  if (!SLUG_PATTERN.test(slug)) throw new NotFoundError("Site", slug);
  const project = await db.websiteProject.findUnique({
    where: { slug },
    select: { id: true, slug: true, status: true, template: true, contentJSON: true, expiresAt: true },
  });
  if (!project || project.status !== "PUBLISHED" || !isPreviewTemplate(project.template)) {
    throw new NotFoundError("Site", slug);
  }
  return project;
}

export async function getPublicSite(db: PrismaClient, slug: string, now = new Date()): Promise<PublicSite> {
  const project = await loadPublishedProject(db, slug);
  const parsed = dentalContentSchema.safeParse(project.contentJSON);
  if (!parsed.success) throw new NotFoundError("Site", slug);

  const expired = Boolean(project.expiresAt && project.expiresAt.getTime() <= now.getTime());
  const video = expired
    ? null
    : await db.demoRecording.findFirst({
        where: { websiteProjectId: project.id, status: "READY", storageKey: { not: null } },
        select: { id: true, desktopStorageKey: true },
      });

  return {
    slug: project.slug,
    template: parsed.data.template,
    // An expired preview still returns its name (for the "expired" page) but nothing else.
    content: expired ? { ...parsed.data, phone: undefined, phoneDigits: undefined, address: undefined, mapsQuery: undefined } : parsed.data,
    expired,
    expiresAt: project.expiresAt?.toISOString() ?? null,
    hasVideo: Boolean(video),
    hasLaptopVideo: Boolean(video?.desktopStorageKey),
  };
}

/** Which of a pitch's two walkthroughs: the phone one (the default) or the laptop one. */
export type VideoView = "phone" | "laptop";

export async function getPublicVideoUrl(db: PrismaClient, slug: string, now = new Date(), view: VideoView = "phone"): Promise<string> {
  const project = await loadPublishedProject(db, slug);
  if (project.expiresAt && project.expiresAt.getTime() <= now.getTime()) throw new NotFoundError("Video", slug);
  const recording = await db.demoRecording.findFirst({
    where: { websiteProjectId: project.id, status: "READY", storageKey: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { storageKey: true, desktopStorageKey: true },
  });
  const storage = getObjectStorage();
  const key = view === "laptop" ? recording?.desktopStorageKey : recording?.storageKey;
  if (!key || !storage) throw new NotFoundError("Video", slug);
  return storage.signedGetUrl(key, RECORDING_URL_TTL_SECONDS);
}
