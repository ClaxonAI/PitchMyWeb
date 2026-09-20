import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPreviewChrome, isPreviewTemplate, PREVIEW_TEMPLATE_CODES } from "@pitchmyweb/templates";
import { DentalClinicSite } from "@/templates/dental-clinic/DentalClinicSite";
import { buildDemoContent, getDemoSample } from "@/lib/demo-samples";

type PageProps = {
  params: Promise<{ template: string }>;
  searchParams: Promise<{ embed?: string }>;
};

export function generateStaticParams() {
  return PREVIEW_TEMPLATE_CODES.map((template) => ({ template }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const template = (await params).template;
  const sample = getDemoSample(template);
  if (!sample) return { title: "Demo not found", robots: { index: false, follow: false } };
  const chrome = getPreviewChrome(sample.template);
  return {
    title: `${sample.name} · ${chrome.noun} demo`,
    description: sample.category,
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function DemoTemplatePage({ params, searchParams }: PageProps) {
  const template = (await params).template;
  if (!isPreviewTemplate(template)) notFound();

  const embed = (await searchParams).embed === "1";
  const content = buildDemoContent(template);

  return (
    <div className={embed ? "demo-embed" : undefined}>
      <DentalClinicSite content={content} />
    </div>
  );
}
