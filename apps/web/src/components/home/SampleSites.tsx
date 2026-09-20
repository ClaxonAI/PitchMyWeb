import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { sampleDemoUrl, sampleSites } from "@/data/sampleSites";
import { cn } from "@/lib/utils";

function TemplateFrame({
  template,
  name,
  domain,
}: {
  template: string;
  name: string;
  domain: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
      <div className="flex items-center gap-2 border-b border-black/6 bg-[#f7f7f8] px-3 py-2">
        <div className="flex gap-1">
          <span className="size-2 rounded-full bg-[#ff5f57]" />
          <span className="size-2 rounded-full bg-[#febc2e]" />
          <span className="size-2 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto truncate rounded-md bg-white px-3 py-0.5 font-mono text-[9px] text-black/45 ring-1 ring-black/5">
          {domain}
        </div>
      </div>
      <div className="relative aspect-[5/4] overflow-hidden bg-[#f6f2ea]">
        <iframe
          title={`${name} preview template`}
          src={sampleDemoUrl(template, true)}
          loading="lazy"
          className="pointer-events-none absolute left-0 top-0 h-[200%] w-[200%] origin-top-left scale-50 border-0"
        />
        <a
          href={sampleDemoUrl(template)}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-10"
          aria-label={`Open ${name} template`}
        />
      </div>
    </div>
  );
}

export function SampleSites() {
  return (
    <section id="samples" className="scroll-mt-20 bg-ink py-24 text-white lg:py-32">
      <Container>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            tone="dark"
            eyebrow="Sample sites"
            title="The same templates we ship to your leads."
            body="Real preview sites — dental, salon, café, gym and more — filled with each business's name, place and contact details."
          />
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {sampleSites.map((site, i) => (
            <article key={site.domain} className={cn("group", i % 2 === 1 && "md:translate-y-12")}>
              <div className="overflow-hidden rounded-[24px] bg-white/[0.04] p-2.5 ring-1 ring-white/8 transition-all duration-500 group-hover:bg-white/[0.07] group-hover:ring-lilac/40">
                <TemplateFrame template={site.template} name={site.name} domain={site.domain} />
              </div>
              <div className="mt-5 flex items-center justify-between px-1.5">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">{site.name}</h3>
                  <p className="mt-0.5 text-[13px] text-white/40">
                    <span>{site.category}</span>
                    <span className="mx-2 opacity-50">·</span>
                    <span>{site.city}</span>
                  </p>
                </div>
                <a
                  href={sampleDemoUrl(site.template)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] text-white/35 transition-all duration-300 hover:border-lime/30 hover:text-lime group-hover:border-lime/30 group-hover:text-lime"
                >
                  {site.domain}
                  <ArrowUpRight size={12} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
