import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSite, fetchVideoUrl } from "@/lib/api";
import { getPreviewChrome } from "@pitchmyweb/templates";
import { ArrowIcon, BrandMark } from "@/templates/dental-clinic/icons";

type PageProps = { params: Promise<{ slug: string }> };

// Signed URLs are short-lived, so this page is rendered per request.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = (await params).slug;
  const site = await fetchSite(slug);
  if (!site) return { title: "Walkthrough", robots: { index: false, follow: false, nocache: true } };
  const title = `${site.content.businessName} · Website walkthrough`;
  const description = `A short video tour of the website concept prepared for ${site.content.businessName}.`;
  // The walkthrough link is the second link in a direct pitch; give it the same card.
  const image = { url: `/s/${slug}/og`, width: 1200, height: 630, alt: `Website concept for ${site.content.businessName}` };
  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true },
    openGraph: { type: "video.other", locale: "en_IN", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function VideoPage({ params }: PageProps) {
  const { slug } = await params;
  const site = await fetchSite(slug);
  if (!site || site.expired) notFound();
  const videoUrl = await fetchVideoUrl(slug);
  const chrome = getPreviewChrome(site.content.template);

  return (
    <main data-theme={site.content.theme} className="min-h-dvh bg-page px-5 py-10 text-ink sm:py-16">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="grid size-11 place-items-center rounded-full bg-brand text-white">
          <BrandMark mark={chrome.mark} className="size-5" />
        </span>
        <p className="kicker mt-6 text-brand">Website walkthrough</p>
        <h1 className="display mt-3 text-[38px] leading-[1.05]">A new website for {site.content.businessName}</h1>

        <div className="mt-8 w-full overflow-hidden rounded-[2rem] border border-line bg-ink shadow-float">
          {videoUrl ? (
            <video src={videoUrl} controls playsInline preload="metadata" className="aspect-[9/19] w-full bg-ink object-contain" />
          ) : (
            <div className="grid aspect-[9/16] place-items-center p-8 text-[15px] text-white/70">The video is still being prepared. Try again in a few minutes.</div>
          )}
        </div>

        <Link
          href={`/s/${slug}`}
          className="mt-8 inline-flex h-13 items-center gap-2.5 rounded-full bg-brand px-7 text-[15px] font-semibold text-white transition hover:bg-brand-deep"
        >
          Open the website
          <ArrowIcon className="size-4" />
        </Link>
        <p className="mt-6 text-[12px] text-muted">A website concept prepared for {site.content.businessName}. Not the {chrome.footerKind}&apos;s official website.</p>
      </div>
    </main>
  );
}
