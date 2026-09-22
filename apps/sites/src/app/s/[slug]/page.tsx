import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { fetchSite } from "@/lib/api";
import { PreviewSite } from "@/templates/PreviewSite";
import { previewThemeColor } from "@/templates/surface";
import { getPreviewChrome } from "@pitchmyweb/templates";

type PageProps = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = (await params).slug;
  const site = await fetchSite(slug);
  if (!site) return { title: "Preview not found", robots: { index: false, follow: false } };
  const { businessName, area, intro, template } = site.content;
  const chrome = getPreviewChrome(template);
  const title = `${businessName}${area ? ` · ${chrome.noun} in ${area}` : ` · ${chrome.noun}`}`;
  const description = site.expired ? "This website preview has ended." : intro;
  // What WhatsApp shows under the link in the pitch message.
  const image = { url: `/s/${slug}/og`, width: 1200, height: 630, alt: `Website concept for ${businessName}` };
  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true },
    openGraph: { type: "website", locale: "en_IN", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

// Browser chrome on phones takes the colour of the design being shown.
// Cosmetic only, so a failed lookup falls back to the layout default.
export async function generateViewport({ params }: PageProps): Promise<Viewport> {
  try {
    const site = await fetchSite((await params).slug);
    return site && !site.expired ? { themeColor: previewThemeColor(site.content) } : {};
  } catch {
    return {};
  }
}

function Expired({ name }: { name: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md">
        <p className="kicker text-muted">Preview ended</p>
        <h1 className="display mt-4 text-4xl">The website concept for {name} is no longer available.</h1>
        <p className="mt-4 text-muted">Previews are shown for a limited time. Ask the person who shared it for a new link.</p>
      </div>
    </main>
  );
}

export default async function PreviewPage({ params }: PageProps) {
  const site = await fetchSite((await params).slug);
  if (!site) notFound();
  if (site.expired) return <Expired name={site.content.businessName} />;
  return <PreviewSite content={site.content} />;
}
