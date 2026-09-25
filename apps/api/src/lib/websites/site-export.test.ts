import { afterAll, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { prisma } from "../db/client";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { ConflictError, NotFoundError } from "../errors";
import { exportPublishedSite, stripScripts } from "./site-export";

const SOURCE = "site-export:test";
const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.business.deleteMany({ where: { source: SOURCE } });
  await prisma.$disconnect();
});

process.env.SITES_PUBLIC_URL = "https://preview.example.test";

const PAGE = `<!DOCTYPE html><html class=""><head>
<link rel="stylesheet" href="/_next/static/css/app.css" data-precedence="next"/>
<link rel="preload" as="script" href="/_next/static/chunks/main.js"/>
<link rel="icon" href="/favicon.ico"/>
<script src="/_next/static/chunks/main.js" async></script>
</head><body>
<section data-reveal><h1>Smile Dental</h1><img src="/images/hero.webp" srcset="/images/hero.webp 1x, /images/hero@2x.webp 2x" alt=""/></section>
<a href="/s/smile-dental/video">Watch</a> <a href="https://wa.me/919800000000">WhatsApp</a>
<script>self.__next_f.push([1,"payload"])</script>
</body></html>`;

const ASSETS: Record<string, string> = {
  "/_next/static/css/app.css": `body{font-family:X}@font-face{font-family:X;src:url(/_next/static/media/inter.woff2) format("woff2")}`,
  "/_next/static/media/inter.woff2": "FONT",
  "/favicon.ico": "ICO",
  "/images/hero.webp": "IMG1",
  "/images/hero@2x.webp": "IMG2",
};

function fakeSites(slug: string) {
  const requested: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requested.push(url.pathname);
    if (url.pathname === `/s/${slug}`) return new Response(PAGE.replaceAll("smile-dental", slug), { status: 200 });
    const body = ASSETS[url.pathname];
    return body ? new Response(body, { status: 200 }) : new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { deps: { fetch: fetchImpl }, requested };
}

async function projectFor(status: "PUBLISHED" | "DRAFT", expiresAt: Date | null = null) {
  const user = await createTestUser("site-export");
  createdUserIds.push(user.id);
  const campaign = await prisma.campaign.create({ data: { userId: user.id, name: "Export", location: "Chennai", category: "Dental Clinic", leadLimit: 1 } });
  const business = await prisma.business.create({ data: { name: `Smile Dental ${Date.now()}`, category: "Dental Clinic", source: SOURCE } });
  const lead = await prisma.lead.create({ data: { campaignId: campaign.id, businessId: business.id } });
  const slug = `smile-dental-${Math.random().toString(36).slice(2, 8)}`;
  const project = await prisma.websiteProject.create({
    data: { leadId: lead.id, template: "dental-clinic", contentJSON: { businessName: "Smile Dental" }, slug, status, expiresAt, publishedUrl: `https://preview.example.test/s/${slug}` },
  });
  return { user, project, slug };
}

describe("exportPublishedSite", () => {
  it("zips a static copy: index.html without scripts, with its CSS, fonts and images under assets/", async () => {
    const { user, project, slug } = await projectFor("PUBLISHED");
    const { deps } = fakeSites(slug);

    const { filename, zip } = await exportPublishedSite(prisma, user.id, project.id, deps);
    expect(filename).toBe(`${slug}.zip`);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(
      [
        "README.txt",
        "assets/app.css",
        "assets/favicon.ico",
        "assets/hero.webp",
        "assets/hero_2x.webp",
        "assets/inter.woff2",
        "index.html",
        "site-data/content.json",
        "site-data/design.json",
        "site-data/manifest.json",
      ].sort(),
    );

    const html = strFromU8(files["index.html"]!);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('as="script"');
    expect(html).toContain('href="assets/app.css"');
    expect(html).toContain('src="assets/hero.webp"');
    expect(html).toContain('srcset="assets/hero.webp 1x, assets/hero_2x.webp 2x"');
    expect(html).toContain('href="assets/favicon.ico"');
    // Another page of the site stays a live link; external links are untouched.
    expect(html).toContain(`href="https://preview.example.test/s/${slug}/video"`);
    expect(html).toContain('href="https://wa.me/919800000000"');
    expect(html).toContain("<h1>Smile Dental</h1>");

    // The stylesheet points at the font next to it.
    expect(strFromU8(files["assets/app.css"]!)).toContain('url("inter.woff2")');
    expect(strFromU8(files["assets/inter.woff2"]!)).toBe("FONT");
    // The editable generation data rides along.
    expect(JSON.parse(strFromU8(files["site-data/content.json"]!))).toEqual({ businessName: "Smile Dental" });
    expect(JSON.parse(strFromU8(files["site-data/manifest.json"]!))).toMatchObject({ template: "dental-clinic", slug });
  });

  it("refuses a draft, an expired preview, and someone else's website", async () => {
    const draft = await projectFor("DRAFT");
    await expect(exportPublishedSite(prisma, draft.user.id, draft.project.id, fakeSites(draft.slug).deps)).rejects.toThrow(ConflictError);

    const expired = await projectFor("PUBLISHED", new Date(Date.now() - 1000));
    await expect(exportPublishedSite(prisma, expired.user.id, expired.project.id, fakeSites(expired.slug).deps)).rejects.toThrow(/expired/);

    const other = await createTestUser("site-export-other");
    createdUserIds.push(other.id);
    const mine = await projectFor("PUBLISHED");
    await expect(exportPublishedSite(prisma, other.id, mine.project.id, fakeSites(mine.slug).deps)).rejects.toThrow(NotFoundError);
  });

  it("fails cleanly when the published page cannot be fetched", async () => {
    const { user, project } = await projectFor("PUBLISHED");
    const deps = { fetch: (async () => new Response("down", { status: 502 })) as unknown as typeof fetch };
    await expect(exportPublishedSite(prisma, user.id, project.id, deps)).rejects.toThrow(NotFoundError);
  });
});

describe("stripScripts", () => {
  it("removes inline, external and self-closing scripts and script preloads, and nothing else", () => {
    const html = `<head><link rel="modulepreload" href="/a.js"><link rel="stylesheet" href="/a.css"><script src="/b.js"></script><script>x()</script><script src="/c.js"/></head><p>keep</p>`;
    expect(stripScripts(html)).toBe(`<head><link rel="stylesheet" href="/a.css"></head><p>keep</p>`);
  });
});
