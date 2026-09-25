import { strToU8, zipSync } from "fflate";
import type { PrismaClient } from "@pitchmyweb/db";
import { ConflictError, NotFoundError } from "../errors";
import { getWebsiteProjectForUser, sitesPublicUrl } from "./website.service";

// Download a published sample site as a ZIP: index.html plus the CSS, fonts
// and images it uses, with every reference rewritten to a relative path, so
// it opens straight from the unzipped folder or uploads to any static host;
// and the site's content/design JSON under site-data/ for editing.
//
// The page is fetched from apps/sites exactly as a visitor sees it, then
// made static:
//   - Every <script> goes. The templates render fully on the server; their
//     scripts only add the scroll-in animation, which switches on through a
//     `.js` class a script sets, so without scripts every section simply
//     shows (see [data-reveal] in apps/sites globals.css).
//   - Same-origin stylesheets, fonts (url(...) inside the CSS) and images are
//     downloaded into assets/. Other absolute URLs (maps, WhatsApp links) are
//     left as they are; site-relative links to other pages become absolute
//     links to the live preview.

const MAX_ASSETS = 80;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export type ExportDeps = { fetch: typeof fetch };
const defaultDeps: ExportDeps = { fetch: (...args) => fetch(...args) };

/** Where the API reaches apps/sites: an internal address when set, else the public one. */
function sitesOrigin(): string {
  const internal = process.env.SITES_INTERNAL_URL?.trim();
  const origin = internal ? internal.replace(/\/+$/, "") : sitesPublicUrl();
  if (!origin) throw new ConflictError("Website export is not configured (SITES_PUBLIC_URL is not set)");
  return origin;
}

async function fetchWithTimeout(deps: ExportDeps, url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await deps.fetch(url, { signal: controller.signal, cache: "no-store", headers: { "User-Agent": "PitchMyWeb-Export" } });
  } finally {
    clearTimeout(timer);
  }
}

function assetName(url: URL, used: Set<string>): string {
  const base = (url.pathname.split("/").pop() || "asset").replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "asset";
  let name = base;
  for (let n = 2; used.has(name); n += 1) name = `${n}-${base}`;
  used.add(name);
  return name;
}

/** Removes every <script> element, and preloads that only exist for scripts. */
export function stripScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*\brel=["']preload["'][^>]*\bas=["']script["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*\bas=["']script["'][^>]*\brel=["']preload["'][^>]*>/gi, "");
}

type Collected = { files: Record<string, Uint8Array>; total: number; used: Set<string>; byUrl: Map<string, string> };

async function download(deps: ExportDeps, url: URL, bag: Collected): Promise<{ path: string; bytes: Uint8Array; type: string } | null> {
  const key = url.href.split("#")[0]!;
  const existing = bag.byUrl.get(key);
  if (existing) return { path: existing, bytes: bag.files[existing]!, type: "" };
  if (bag.byUrl.size >= MAX_ASSETS) return null;
  try {
    const response = await fetchWithTimeout(deps, key);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bag.total + bytes.byteLength > MAX_TOTAL_BYTES) return null;
    const path = `assets/${assetName(url, bag.used)}`;
    bag.files[path] = bytes;
    bag.total += bytes.byteLength;
    bag.byUrl.set(key, path);
    return { path, bytes, type: response.headers.get("content-type") ?? "" };
  } catch {
    return null;
  }
}

/** Downloads a stylesheet and the fonts/images its url(...) references point at. */
async function inlineCss(deps: ExportDeps, cssUrl: URL, origin: string, bag: Collected): Promise<string | null> {
  const got = await download(deps, cssUrl, bag);
  if (!got) return null;
  let css = new TextDecoder().decode(got.bytes);
  const refs = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
  for (const match of refs) {
    const raw = match[2]!.trim();
    if (raw.startsWith("data:")) continue;
    const ref = new URL(raw, cssUrl);
    if (ref.origin !== origin) continue;
    const asset = await download(deps, ref, bag);
    if (asset) css = css.split(match[0]).join(`url("${asset.path.replace(/^assets\//, "")}")`);
  }
  bag.files[got.path] = strToU8(css);
  return got.path;
}

export async function exportPublishedSite(
  db: PrismaClient,
  userId: string,
  projectId: string,
  deps: ExportDeps = defaultDeps,
): Promise<{ filename: string; zip: Uint8Array }> {
  const project = await getWebsiteProjectForUser(db, userId, projectId);
  if (project.status !== "PUBLISHED") throw new ConflictError("Publish this website before downloading it");
  if (project.expiresAt && project.expiresAt.getTime() <= Date.now()) throw new ConflictError("This website's preview has expired, so it can no longer be downloaded");

  const origin = sitesOrigin();
  const pageUrl = new URL(`${origin}/s/${project.slug}`);
  const publicBase = sitesPublicUrl() ?? origin;
  const response = await fetchWithTimeout(deps, pageUrl.href).catch(() => null);
  if (!response?.ok) throw new NotFoundError("Published website", project.slug);

  let html = stripScripts(await response.text());
  const bag: Collected = { files: {}, total: 0, used: new Set(["index.html", "README.txt"]), byUrl: new Map() };

  // Stylesheets (and, through them, fonts).
  for (const match of [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)]) {
    const href = /\bhref=["']([^"']+)["']/i.exec(match[0])?.[1];
    if (!href) continue;
    const url = new URL(href, pageUrl);
    if (url.origin !== pageUrl.origin) continue;
    const path = await inlineCss(deps, url, pageUrl.origin, bag);
    if (path) html = html.split(match[0]).join(match[0].replace(href, path));
  }

  // Same-origin images, icons and other src/href/srcset assets.
  for (const match of [...html.matchAll(/\b(src|href|poster)=["'](\/(?!\/)[^"']*)["']/gi)]) {
    const [whole, attr, value] = match as unknown as [string, string, string];
    const url = new URL(value, pageUrl);
    const isAsset = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|css|mp4)(?:$|\?)/i.test(url.pathname) || url.pathname.startsWith("/_next/");
    if (isAsset) {
      const asset = await download(deps, url, bag);
      if (asset) html = html.split(whole).join(`${attr}="${asset.path}"`);
      continue;
    }
    // A link to another page of the site (e.g. the video page): keep it live.
    html = html.split(whole).join(`${attr}="${new URL(value, publicBase).href}"`);
  }
  for (const match of [...html.matchAll(/\bsrcset=["']([^"']+)["']/gi)]) {
    const parts = await Promise.all(
      match[1]!.split(",").map(async (candidate) => {
        const [src, size] = candidate.trim().split(/\s+/, 2);
        if (!src?.startsWith("/") || src.startsWith("//")) return candidate.trim();
        const asset = await download(deps, new URL(src, pageUrl), bag);
        return asset ? [asset.path, size].filter(Boolean).join(" ") : candidate.trim();
      }),
    );
    html = html.split(match[0]).join(`srcset="${parts.join(", ")}"`);
  }

  const readme = [
    `${project.slug} — exported from PitchMyWeb`,
    "",
    "Open index.html in a browser, or upload this whole folder to any static host",
    "(Netlify, Vercel, GitHub Pages, cPanel, S3). Keep the assets folder next to index.html.",
    "",
    "The site's own content and design are in site-data/ as JSON (business name,",
    "services, contact details, theme), for editing or rebuilding it elsewhere.",
    "",
    `Live preview: ${publicBase}/s/${project.slug}`,
    "",
  ].join("\n");

  // The generation data, so the site can be edited or rebuilt, not only
  // hosted as is.
  const json = (value: unknown) => strToU8(`${JSON.stringify(value ?? {}, null, 2)}\n`);
  const siteData = {
    "site-data/content.json": json(project.contentJSON),
    "site-data/design.json": json(project.designJSON),
    "site-data/manifest.json": json({ template: project.template, theme: project.theme, slug: project.slug, versionCount: project.versions.length }),
  };

  const zip = zipSync({ "index.html": strToU8(html), "README.txt": strToU8(readme), ...siteData, ...bag.files }, { level: 6 });
  return { filename: `${project.slug}.zip`, zip };
}
