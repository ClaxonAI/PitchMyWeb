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
        where: { websiteProjectId: project.id, status: "READY", storageKey: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { id: true },
      });

  return {
    slug: project.slug,
    template: parsed.data.template,
    // An expired preview still returns its name (for the "expired" page) but nothing else.
    content: expired ? { ...parsed.data, phone: undefined, phoneDigits: undefined, address: undefined, mapsQuery: undefined } : parsed.data,
    expired,
    expiresAt: project.expiresAt?.toISOString() ?? null,
    hasVideo: Boolean(video),
  };
}

export async function getPublicVideoUrl(db: PrismaClient, slug: string, now = new Date()): Promise<string> {
  const project = await loadPublishedProject(db, slug);
  if (project.expiresAt && project.expiresAt.getTime() <= now.getTime()) throw new NotFoundError("Video", slug);
  const recording = await db.demoRecording.findFirst({
    // A video past its download window is gone for recipients too, even
    // before the maintenance sweep has deleted the object.
    where: { websiteProjectId: project.id, status: "READY", storageKey: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { updatedAt: "desc" },
    select: { storageKey: true },
  });
  const storage = getObjectStorage();
  if (!recording?.storageKey || !storage) throw new NotFoundError("Video", slug);
  return storage.signedGetUrl(recording.storageKey, RECORDING_URL_TTL_SECONDS);
}
