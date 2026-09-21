import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import {
  getPreviewChrome,
  isPreviewTemplate,
  PREVIEW_DESIGNS,
  PREVIEW_TEMPLATE_CODES,
  type PreviewDesign,
} from "@pitchmyweb/templates";
import { PreviewSite } from "@/templates/PreviewSite";
import { previewThemeColor } from "@/templates/surface";
import { buildDemoContent, getDemoSample } from "@/lib/demo-samples";

type PageProps = {
  params: Promise<{ template: string }>;
  searchParams: Promise<{ embed?: string; design?: string }>;
};

// Demos are deterministic: the classic layout unless ?design=studio asks for
// the alternate one (the dental clinic only has the classic layout).
function demoDesign(value: string | undefined): PreviewDesign {
  return PREVIEW_DESIGNS.find((design) => design === value) ?? "classic";
}

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

export async function generateViewport({ params, searchParams }: PageProps): Promise<Viewport> {
  const template = (await params).template;
  if (!isPreviewTemplate(template)) return {};
  return { themeColor: previewThemeColor(buildDemoContent(template, demoDesign((await searchParams).design))) };
}

export default async function DemoTemplatePage({ params, searchParams }: PageProps) {
  const template = (await params).template;
  if (!isPreviewTemplate(template)) notFound();

  const query = await searchParams;
  const content = buildDemoContent(template, demoDesign(query.design));

  return (
    <div className={query.embed === "1" ? "demo-embed" : undefined}>
      <PreviewSite content={content} />
    </div>
  );
}
