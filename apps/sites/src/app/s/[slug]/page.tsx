import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchSite } from "@/lib/api";
import { DentalClinicSite } from "@/templates/dental-clinic/DentalClinicSite";
import { getPreviewChrome } from "@pitchmyweb/templates";

type PageProps = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const site = await fetchSite((await params).slug);
  if (!site) return { title: "Preview not found", robots: { index: false, follow: false } };
  const { businessName, area, intro, template } = site.content;
  const chrome = getPreviewChrome(template);
  return {
    title: `${businessName}${area ? ` · ${chrome.noun} in ${area}` : ` · ${chrome.noun}`}`,
    description: intro,
    robots: { index: false, follow: false, nocache: true },
  };
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
  return <DentalClinicSite content={site.content} />;
}
