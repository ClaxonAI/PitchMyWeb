import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { sampleDemoUrl, samplePreviewImage, sampleSites } from "@/data/sampleSites";
import type { SampleSite } from "@/types";
import { cn } from "@/lib/utils";

// Each card is a screenshot of the real demo, not a live iframe: six live
// previews meant six whole sites (scripts, fonts, maps) loading inside this
// page, which on a phone was most of its weight. The card opens the live demo.

function SampleCard({ site, index }: { site: SampleSite; index: number }) {
  const design = site.design === "studio" ? "Studio design" : "Classic design";
  return (
    <a
      href={sampleDemoUrl(site)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group block w-[82%] shrink-0 snap-start sm:w-[60%] md:w-auto",
        // A gentle stagger, per column count: every other card on two columns,
        // the middle column on three.
        index % 2 === 1 && "md:max-lg:translate-y-12",
        index % 3 === 1 && "lg:translate-y-12",
      )}
    >
      <div className="overflow-hidden rounded-[24px] bg-white/[0.04] p-2.5 ring-1 ring-white/10 transition-all duration-500 group-hover:bg-white/[0.07] group-hover:ring-lilac/40 group-focus-visible:ring-lilac">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
          <div aria-hidden className="flex items-center gap-2 border-b border-black/6 bg-[#f7f7f8] px-3 py-2">
            <div className="flex gap-1">
              <span className="size-2 rounded-full bg-[#ff5f57]" />
              <span className="size-2 rounded-full bg-[#febc2e]" />
              <span className="size-2 rounded-full bg-[#28c840]" />
            </div>
            <div className="mx-auto truncate rounded-md bg-white px-3 py-0.5 font-mono text-[11px] text-black/60 ring-1 ring-black/5">{site.domain}</div>
          </div>
          <div className="relative aspect-[5/4] overflow-hidden bg-[#f6f2ea]">
            <Image
              src={samplePreviewImage(site)}
              alt={`${site.name} sample site, ${design.toLowerCase()}`}
              width={800}
              height={640}
              loading="lazy"
              sizes="(min-width: 1024px) 380px, (min-width: 768px) 45vw, 82vw"
              className="size-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.02]"
            />
            <span className="absolute top-3 left-3 rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white backdrop-blur">
              {design}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 px-1.5">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight">{site.name}</h3>
          <p className="mt-0.5 truncate text-[13px] text-white/80">
            {site.category}
            <span aria-hidden className="mx-2 opacity-60">·</span>
            {site.city}
          </p>
        </div>
        <span className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-[12px] text-white/75 transition-colors duration-300 group-hover:border-lime/40 group-hover:text-lime">
          Open live
          <ArrowUpRight size={13} aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </span>
      </div>
    </a>
  );
}

export function SampleSites() {
  return (
    <section id="samples" className="scroll-mt-20 bg-ink py-24 text-white lg:py-32">
      <Container>
        <SectionHeading
          tone="dark"
          eyebrow="Sample sites"
          title="The same templates we ship to your leads."
          body="Real preview sites, in two designs for every trade — dental, salon, café, gym, events and more — filled with each business's own name, place and contact details."
        />
        <p className="mt-6 text-[13px] text-white/60 md:hidden">Swipe to see all {sampleSites.length} →</p>
      </Container>

      {/* Phones: a swipeable row that peeks the next card. From md up: a grid. */}
      <Container className="mt-6 md:mt-14">
        {/* relative: the cards contain sr-only (absolute) text, which would otherwise
            be placed against the page and widen it past the screen. */}
        <div className="relative -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 md:pb-12 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {sampleSites.map((site, i) => (
            <SampleCard key={`${site.template}-${site.design}`} site={site} index={i} />
          ))}
        </div>
      </Container>
    </section>
  );
}
