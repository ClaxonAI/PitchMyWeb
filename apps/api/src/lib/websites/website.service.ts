import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient, WebsiteProject, WebsiteStatus, WebsiteVersion } from "@pitchmyweb/db";
import { ConflictError, InvalidWebsiteTransitionError, NotFoundError, isUniqueConstraintViolation } from "../errors";
import type { PaginatedResult } from "../campaigns/campaign.service";
import type { WebsiteContent, WebsiteDesignJson, WebsiteListQuery } from "../validation/website";
import { recordActivity } from "../activities/activity.service";
import { isLeadTransitionAllowed, transitionLeadStatusInTx } from "../leads/lifecycle";

// WebsiteProject/WebsiteVersion domain service (backend_tasks.md section
// 12/13, Phase 6). Ownership flows through Lead -> Campaign -> User, the
// same relationship chain lib/leads/lead.service.ts already uses — every
// function here checks it the same way (cheap ownership-only query first,
// same convention as getLeadForUser's Phase 4 fix), never trusting a
// caller-supplied id alone.

function baseAppUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function buildDemoUrl(slug: string): string {
  return `${baseAppUrl()}/demo/${slug}`;
}

/**
 * Public preview origin (apps/sites), e.g. https://preview.pitchmyweb.com.
 * Null when not configured, in which case the legacy APP_URL path is used.
 */
export function sitesPublicUrl(): string | null {
  const value = process.env.SITES_PUBLIC_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

export function buildPublishedUrl(slug: string): string {
  const sites = sitesPublicUrl();
  return sites ? `${sites}/s/${slug}` : `${baseAppUrl()}/site/${slug}`;
}

// Phase 6 section 11: deterministic-enough-to-be-understandable (derived
// from the business name) + unique (random suffix + DB unique constraint,
// not just the suffix's own low collision odds).
function slugifyBusinessName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "site";
}

function randomSlugSuffix(): string {
  return randomBytes(4).toString("hex"); // 8 hex chars
}

const MAX_SLUG_ATTEMPTS = 5;

/**
 * Runs `attempt(slug)` with a freshly generated candidate slug, retrying
 * with a new random suffix if the database's unique constraint on
 * WebsiteProject.slug rejects it (section 11: "do not rely solely on an
 * in-memory uniqueness check" — the constraint is authoritative, this is
 * just idempotent recovery around it, the same pattern
 * lib/leads/lead.service.ts's createLead already uses for its own unique
 * constraint). A collision is astronomically unlikely with an 8-hex-char
 * random suffix, but the retry loop is what actually makes "duplicate slug
 * attempts must be handled correctly" true rather than assumed.
 */
async function withUniqueSlug<T>(businessName: string, attempt: (slug: string) => Promise<T>): Promise<T> {
  const base = slugifyBusinessName(businessName);
  let lastError: unknown;
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i += 1) {
    const slug = `${base}-${randomSlugSuffix()}`;
    try {
      return await attempt(slug);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to generate a unique website slug after multiple attempts");
}

/** Ownership-checked fetch of the bare WebsiteProject row (no versions) — used internally where the version list isn't needed. */
async function loadOwnedWebsiteProject(db: PrismaClient, userId: string, projectId: string): Promise<WebsiteProject> {
  const project = await db.websiteProject.findUnique({
    where: { id: projectId },
    include: { lead: { select: { campaign: { select: { userId: true } } } } },
  });
  if (!project || project.lead.campaign.userId !== userId) {
    throw new NotFoundError("WebsiteProject", projectId);
  }
  const { lead: _lead, ...row } = project;
  return row;
}

const WEBSITE_DETAIL_INCLUDE = {
  versions: { orderBy: { versionNumber: "asc" as const } },
};

export type WebsiteProjectDetail = WebsiteProject & { versions: WebsiteVersion[] };

/**
 * GET /api/websites/:id: ownership-checked (cheap check first, same
 * convention as lib/leads/lead.service.ts's getLeadForUser), then the full
 * project with its complete, ordered version history — WebsiteVersion is
 * immutable historical data (section 8), so nothing here ever filters it
 * down to "just the latest."
 */
export async function getWebsiteProjectForUser(db: PrismaClient, userId: string, projectId: string): Promise<WebsiteProjectDetail> {
  await loadOwnedWebsiteProject(db, userId, projectId);
  const project = await db.websiteProject.findUnique({ where: { id: projectId }, include: WEBSITE_DETAIL_INCLUDE });
  if (!project) throw new NotFoundError("WebsiteProject", projectId);
  return project;
}

/**
 * GET /api/websites: scoped to the authenticated user's own leads at the
 * query level (never fetched in bulk and filtered in application code),
 * same pattern as lib/leads/lead.service.ts's listLeadsForUser.
 */
export async function listWebsiteProjectsForUser(db: PrismaClient, userId: string, query: WebsiteListQuery): Promise<PaginatedResult<WebsiteProject>> {
  const where: Prisma.WebsiteProjectWhereInput = {
    lead: { campaign: { userId }, ...(query.leadId ? { id: query.leadId } : {}) },
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    db.websiteProject.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.websiteProject.count({ where }),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export type CreateWebsiteProjectInput = {
  leadId: string;
  contentJSON: WebsiteContent;
  designJSON?: WebsiteDesignJson;
};

/**
 * POST /api/websites (section 7): validates lead ownership, generates a
 * unique slug, and creates the WebsiteProject + its initial WebsiteVersion
 * (versionNumber 1) atomically — if anything fails, neither row is left
 * half-created, and the Lead itself is never touched (this function never
 * writes to the Lead table at all).
 */
export async function createWebsiteProject(db: PrismaClient, userId: string, input: CreateWebsiteProjectInput): Promise<WebsiteProjectDetail> {
  const leadOwnership = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { status: true, campaign: { select: { userId: true } }, business: { select: { name: true } } },
  });
  if (!leadOwnership || leadOwnership.campaign.userId !== userId) {
    throw new NotFoundError("Lead", input.leadId);
  }

  const contentJSON = input.contentJSON as unknown as Prisma.InputJsonValue;
  const designJSON = input.designJSON as unknown as Prisma.InputJsonValue | undefined;

  return withUniqueSlug(leadOwnership.business.name, (slug) =>
    db.$transaction(async (tx) => {
      const demoUrl = buildDemoUrl(slug);
      const project = await tx.websiteProject.create({
        data: {
          leadId: input.leadId,
          slug,
          template: input.contentJSON.template,
          theme: input.contentJSON.theme,
          contentJSON,
          designJSON,
          demoUrl,
          status: "DRAFT",
        },
      });

      const version = await tx.websiteVersion.create({
        data: {
          websiteProjectId: project.id,
          versionNumber: 1,
          template: input.contentJSON.template,
          theme: input.contentJSON.theme,
          contentJSON,
          designJSON,
          demoUrl,
        },
      });

      // Phase 8 section 12 ("Activity Integrity"): WEBSITE_GENERATED must
      // actually be recorded somewhere — it previously never was. When the
      // lead is still at ANALYZED (the normal, first-website path), this
      // goes through the lifecycle graph itself (ANALYZED -> SITE_READY),
      // which records WEBSITE_GENERATED via ACTIVITY_FOR_LEAD_STATUS as a
      // side effect of a real, validated status change — never a direct
      // Lead.status write. If the lead has already moved past SITE_READY
      // (e.g. a second website project generated for an already-pitched
      // lead), there is no forward transition left to make, so the event is
      // recorded directly instead of silently dropped or forced through an
      // illegal transition.
      if (isLeadTransitionAllowed(leadOwnership.status, "SITE_READY")) {
        await transitionLeadStatusInTx(tx, { leadId: input.leadId, nextStatus: "SITE_READY" });
      } else {
        await recordActivity(tx, { leadId: input.leadId, type: "WEBSITE_GENERATED" });
      }

      return { ...project, versions: [version] };
    }),
  );
}

export type CreateWebsiteVersionInput = {
  contentJSON: WebsiteContent;
  designJSON?: WebsiteDesignJson;
};

const MAX_VERSION_NUMBER_ATTEMPTS = 5;

/**
 * PATCH /api/websites/:id (section 8/9/10): every call creates a brand-new
 * WebsiteVersion — the previous version's row is never updated or deleted.
 * Version numbering is computed as (current max + 1) inside the same
 * transaction that inserts it; the `@@unique([websiteProjectId,
 * versionNumber])` constraint is what actually prevents two concurrent
 * requests from ever landing on the same version number (section 8:
 * "verify version numbering is safe under concurrent requests") — if a
 * race is lost, the transaction's unique-constraint violation is caught
 * and the whole read-then-insert is retried with a freshly recomputed
 * max, not assumed safe from application logic alone.
 */
export async function createNewWebsiteVersion(db: PrismaClient, userId: string, projectId: string, input: CreateWebsiteVersionInput): Promise<WebsiteProjectDetail> {
  await loadOwnedWebsiteProject(db, userId, projectId);

  const contentJSON = input.contentJSON as unknown as Prisma.InputJsonValue;
  const designJSON = input.designJSON as unknown as Prisma.InputJsonValue | undefined;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_VERSION_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const latest = await tx.websiteVersion.findFirst({ where: { websiteProjectId: projectId }, orderBy: { versionNumber: "desc" } });
        const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

        const version = await tx.websiteVersion.create({
          data: {
            websiteProjectId: projectId,
            versionNumber: nextVersionNumber,
            template: input.contentJSON.template,
            theme: input.contentJSON.theme,
            contentJSON,
            designJSON,
            demoUrl: latest?.demoUrl ?? null,
          },
        });

        // The project row tracks the *current* content (same relationship
        // as Lead.score mirroring the latest LeadScore row) — the version
        // history below is the append-only source of truth, this is just
        // the convenient "what does this project look like right now"
        // pointer.
        const project = await tx.websiteProject.update({
          where: { id: projectId },
          data: {
            template: input.contentJSON.template,
            theme: input.contentJSON.theme,
            contentJSON,
            designJSON,
          },
        });

        const versions = await tx.websiteVersion.findMany({ where: { websiteProjectId: projectId }, orderBy: { versionNumber: "asc" } });
        return { ...project, versions };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to create a new website version after multiple concurrent attempts");
}

// Phase 6 section 12: DRAFT/READY -> PUBLISHED are the only forward paths
// to publish; PUBLISHED and FAILED are terminal (same "no transition
// enforcement left to chance" approach as campaign/lead status graphs).
// GENERATING isn't reachable from anything in this phase (no async
// generation step exists yet) but is defined for a consistent, complete
// graph rather than an ad hoc partial one.
const WEBSITE_STATUS_TRANSITIONS: Record<WebsiteStatus, WebsiteStatus[]> = {
  DRAFT: ["PUBLISHED", "FAILED"],
  GENERATING: ["READY", "FAILED"],
  READY: ["PUBLISHED", "FAILED"],
  PUBLISHED: [],
  FAILED: [],
};

export function isWebsiteTransitionAllowed(current: WebsiteStatus, next: WebsiteStatus): boolean {
  return WEBSITE_STATUS_TRANSITIONS[current].includes(next);
}

/**
 * POST /api/websites/:id/publish (section 12): validates ownership, that
 * the project is in a publishable state (DRAFT/READY, not already
 * PUBLISHED or FAILED — "invalid publish state" is rejected as a 409, not
 * silently accepted), and that it actually has a current version, then
 * sets status=PUBLISHED and a publishedUrl derived from the project's own
 * unique slug. Never touches WebsiteVersion history at all.
 */
export type PublishWebsiteOptions = {
  /** When the public preview stops being served (apps/sites shows "expired"). */
  expiresAt?: Date;
};

export async function publishWebsiteProject(
  db: PrismaClient,
  userId: string,
  projectId: string,
  options: PublishWebsiteOptions = {},
): Promise<WebsiteProject> {
  const project = await loadOwnedWebsiteProject(db, userId, projectId);

  if (!isWebsiteTransitionAllowed(project.status, "PUBLISHED")) {
    throw new InvalidWebsiteTransitionError(project.status, "PUBLISHED");
  }

  const versionCount = await db.websiteVersion.count({ where: { websiteProjectId: projectId } });
  if (versionCount === 0) {
    // Not reachable through createWebsiteProject (which always creates
    // version 1 atomically with the project), but checked explicitly
    // rather than assumed, per section 12: "validate that the project has
    // a valid current version/content."
    throw new ConflictError("Cannot publish a website project with no versions");
  }

  return db.$transaction(async (tx) => {
    const published = await tx.websiteProject.update({
      where: { id: projectId },
      data: {
        status: "PUBLISHED",
        publishedUrl: buildPublishedUrl(project.slug),
        ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
      },
    });

    // DEMO_PUBLISHED has no corresponding LeadStatus (publishing a demo
    // site is not itself a lifecycle stage — SITE_READY, recorded as
    // WEBSITE_GENERATED, already covers "a website exists"), so this is a
    // direct Activity record, not a lifecycle transition.
    await recordActivity(tx, { leadId: project.leadId, type: "DEMO_PUBLISHED" });

    return published;
  });
}
