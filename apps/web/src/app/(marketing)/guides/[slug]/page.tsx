import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { Breadcrumbs, LandingCta, LinkGrid } from "@/components/seo/LandingPage";
import { Container } from "@/components/ui/Container";
import { findGuide, guides } from "@/data/guides";
import { pageMetadata } from "@/lib/seo/metadata";
import { landingPageSchema } from "@/lib/seo/structured-data";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const guide = findGuide((await params).slug);
  if (!guide) return {};
  return pageMetadata({ path: `/guides/${guide.slug}`, title: guide.title, description: guide.description });
}

export default async function GuidePage({ params }: Params) {
  const guide = findGuide((await params).slug);
  if (!guide) notFound();

  const path = `/guides/${guide.slug}`;
  const trail = [
    { name: "Guides", path: "/guides" },
    { name: guide.title, path },
  ];
  const more = guides.filter((other) => other.slug !== guide.slug).slice(0, 6);

  return (
    <>
      <JsonLd schema={landingPageSchema({ name: guide.title, path, description: guide.description, trail, type: "Article", updated: guide.updated })} />
      <article className="pt-10 pb-8 lg:pt-14">
        <Container className="max-w-3xl">
          <Breadcrumbs trail={trail} />
          <p className="eyebrow mt-8 text-primary">Guide</p>
          <h1 className="display mt-4 text-[38px] leading-[1.06] sm:text-5xl">{guide.title}</h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink/65">{guide.description}</p>
          <p className="mt-3 text-[13px] text-ink/50">
            Updated <time dateTime={guide.updated}>{new Date(guide.updated).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</time>
          </p>
          {guide.sections.map((section) => (
            <section key={section.heading} className="mt-10">
              <h2 className="display text-2xl leading-tight sm:text-3xl">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-[16px] leading-relaxed text-ink/75">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </Container>
      </article>
      <LinkGrid title="More guides" links={more.map((other) => ({ href: `/guides/${other.slug}`, label: other.title }))} />
      <LandingCta title="Skip the prospecting. Start with the replies." />
    </>
  );
}
