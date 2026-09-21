import "./interiors.css";
import { RevealOnScroll } from "../dental-clinic/Reveal";
import {
  conceptNotice,
  contactActions,
  externalProps,
  noContactNote,
  pad,
  primaryHref,
  ratingLine,
  revealDelay,
  servicesNote,
  studioFacts,
  studioLinks,
  visitSteps,
  type StudioProps,
} from "./common";
import { ConceptRibbon, FloatingWhatsApp, MapEmbed } from "./parts";

// sachu45 "interiors" (Abstract) design on scrape facts. The stock photos,
// project gallery, years/project counts and client testimonials of the
// original are not used: image panels are abstract gradients, the gallery
// becomes the visit steps, and the testimonials become the real Google rating
// plus the FAQ. Colours are literal values so the design does not depend on
// (or fight with) the shared site tokens.

const INK = "bg-[#0d1117]";
const MUTED = "text-[#5b616e]";

const TILE_GRADIENTS = [
  "from-[#f0842a] via-[#7a4a2b] to-[#161c26]",
  "from-[#3a4a5c] via-[#161c26] to-[#0d1117]",
  "from-[#d9c7ad] via-[#8a6f52] to-[#2b2118]",
  "from-[#5e7466] via-[#243029] to-[#0d1117]",
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5">
      <path d="M4 12L12 4M12 4H5.5M12 4v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <p className={`text-[12px] tracking-[0.18em] uppercase ${dark ? "text-white/70" : MUTED}`}>{children}</p>;
}

function Heading({ children, dark = false, className = "" }: { children: React.ReactNode; dark?: boolean; className?: string }) {
  return (
    <h2 className={`max-w-2xl text-3xl leading-[1.08] font-semibold tracking-[-0.03em] sm:text-4xl md:text-5xl ${dark ? "text-white" : "text-[#0d1117]"} ${className}`}>
      {children}
    </h2>
  );
}

const BUTTON = "inline-flex min-h-12 items-center justify-center rounded-md px-6 text-[15px] font-medium transition";

export function InteriorsStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#contact");
  const facts = studioFacts(content, { listed: "Services listed", typical: "Common services" });
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const rating = ratingLine(content);
  const note = servicesNote(content, chrome);

  return (
    <div className="interiors-studio bg-white font-sans text-[#0d1117] antialiased [overflow-wrap:break-word]" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#0d1117", color: "rgba(255,255,255,.7)", strong: "#ffffff", accent: "#f0842a" }} />
      <header className="sticky top-0 z-40 border-b border-[#e5e2dd] bg-white lg:bg-white/90 lg:backdrop-blur">
        <Wrap>
          <nav aria-label="Sections" className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className="inline-flex min-h-11 min-w-0 items-center gap-2">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
                <path d="M12 2l3.2 6.8L22 12l-6.8 3.2L12 22l-3.2-6.8L2 12l6.8-3.2L12 2z" fill="#0d1117" />
              </svg>
              <span className="truncate text-lg font-semibold tracking-tight">{content.businessName}</span>
            </a>
            <ul className="hidden items-center gap-8 md:flex">
              {[
                ["About", "#about"],
                [chrome.navServices, "#services"],
                ["Process", "#process"],
                ["Contact", "#contact"],
              ].map(([label, href]) => (
                <li key={href}>
                  <a href={href} className={`text-sm transition hover:text-[#0d1117] ${MUTED}`}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-[#0d1117] px-4 text-sm font-medium transition hover:bg-[#0d1117] hover:text-white"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Enquire</span>
            </a>
          </nav>
        </Wrap>
      </header>

      <main>
        <section className={`relative ${INK}`} data-section="hero">
          <div
            aria-hidden="true"
            className="interiors-hero-art relative h-56 w-full bg-gradient-to-br from-[#f0842a] via-[#7a4a2b] to-[#161c26] sm:h-64 md:absolute md:inset-y-0 md:right-0 md:h-full md:w-1/2"
          >
            <div className="absolute inset-6 border border-white/25 sm:inset-8" />
            <div className="absolute bottom-10 left-10 size-20 border border-white/25 sm:size-24" />
          </div>
          <Wrap className="relative">
            <div className="flex flex-col gap-6 py-14 md:min-h-[32rem] md:max-w-[26rem] md:justify-center md:py-24 lg:max-w-md" data-reveal>
              <Eyebrow dark>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Eyebrow>
              <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.03em] text-white sm:text-5xl">{content.tagline}</h1>
              <p className="max-w-md text-[16px] leading-relaxed text-white/75">
                {chrome.servicesTitle} {chrome.servicesEm}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={cta} {...externalProps(cta)} className={`${BUTTON} bg-white text-[#0d1117] hover:bg-[#f6f4f1]`}>
                  {chrome.cta}
                </a>
                <a href="#services" className={`${BUTTON} border border-white/40 text-white hover:bg-white/10`}>
                  See the {chrome.navServices.toLowerCase()}
                </a>
              </div>
            </div>
          </Wrap>
        </section>

        <section className="py-12 sm:py-20" aria-label="At a glance" data-section="facts">
          <Wrap>
            <ul className="grid grid-cols-2 gap-y-8 sm:grid-cols-3">
              {facts.map((fact, i) => (
                <li key={fact.label} data-reveal style={revealDelay(i * 90)} className={`px-2 sm:px-6 ${i === 0 ? "" : "sm:border-l sm:border-[#e5e2dd]"}`}>
                  <p className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{fact.value}</p>
                  <p className={`mt-2 text-[13px] sm:text-sm ${MUTED}`}>{fact.label}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-20 pb-16 sm:pb-24" id="about" data-section="about">
          <Wrap>
            <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
              <div
                aria-hidden="true"
                className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-gradient-to-br from-[#d9c7ad] via-[#8a6f52] to-[#2b2118]"
                data-reveal
              >
                <div className="absolute inset-6 rounded border border-white/40" />
              </div>
              <div className="flex flex-col items-start gap-4" data-reveal style={revealDelay(120)}>
                <Eyebrow>{chrome.aboutKicker}</Eyebrow>
                <Heading className="max-w-sm">The combination of modern &amp; simplicity</Heading>
                <p className={`max-w-md text-[16px] leading-relaxed ${MUTED}`}>{content.intro}</p>
                {rating && <p className="text-[15px] font-medium">★ {rating}</p>}
                <a href={cta} {...externalProps(cta)} className={`${BUTTON} mt-2 bg-[#0d1117] text-white hover:bg-[#161c26]`}>
                  {chrome.cta}
                </a>
              </div>
            </div>
          </Wrap>
        </section>

        <section className={`scroll-mt-20 ${INK} py-16 sm:py-24`} id="services" data-section="services">
          <Wrap>
            <div className="flex flex-col gap-3" data-reveal>
              <Eyebrow dark>{chrome.servicesKicker}</Eyebrow>
              <Heading dark>What the studio takes on</Heading>
              {note && <p className="max-w-xl text-[15px] leading-relaxed text-white/70">{note}</p>}
            </div>
            <ul className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {content.services.map((service, i) => (
                <li key={service.title} data-reveal style={revealDelay((i % 3) * 90)}>
                  <div aria-hidden="true" className={`relative aspect-[16/7] w-full overflow-hidden rounded-lg bg-gradient-to-br sm:aspect-[16/10] ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]}`}>
                    <span className="absolute bottom-3 left-4 text-sm font-medium text-white/80">{pad(i)}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-white">{service.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/70">{service.description}</p>
                  <a
                    href={cta}
                    {...externalProps(cta)}
                    className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-white transition hover:gap-2.5"
                    aria-label={`Ask about ${service.title}`}
                  >
                    Ask about this
                    <ArrowIcon />
                  </a>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-20 py-16 sm:py-24" id="process" data-section="visit">
          <Wrap>
            <div className="flex flex-col gap-3" data-reveal>
              <Eyebrow>{chrome.visitKicker}</Eyebrow>
              <Heading>{chrome.visitTitle}</Heading>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-lg border border-[#e5e2dd] bg-[#f6f4f1] p-6" data-reveal style={revealDelay(i * 110)}>
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#f0842a] text-sm font-semibold text-[#0d1117]">{i + 1}</span>
                  <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                  <p className={`mt-2 text-[15px] leading-relaxed ${MUTED}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {content.faqs.length > 0 && (
          <section className="bg-[#f6f4f1] py-16 sm:py-24" data-section="faq">
            <Wrap>
              <div className="flex flex-col gap-3" data-reveal>
                <Eyebrow>Good to know</Eyebrow>
                <Heading>Before you get in touch</Heading>
              </div>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {content.faqs.map((faq, i) => (
                  <article key={faq.question} className="rounded-lg bg-white p-7 shadow-sm" data-reveal style={revealDelay(i * 90)}>
                    <h3 className="text-lg leading-snug font-semibold tracking-tight">{faq.question}</h3>
                    <p className={`mt-3 text-[15px] leading-relaxed ${MUTED}`}>{faq.answer}</p>
                  </article>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className={`scroll-mt-20 ${INK} py-16 sm:py-24`} id="contact" data-section="contact">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
              <div className="flex flex-col gap-3" data-reveal>
                <Eyebrow dark>Let&apos;s talk</Eyebrow>
                <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.03em] text-white sm:text-4xl md:text-5xl">
                  {chrome.closingTitle} {chrome.closingEm}
                </h2>
                {(content.address || content.phone) && (
                  <address className="mt-3 grid max-w-md gap-1 text-[15px] leading-relaxed text-white/75 not-italic">
                    {content.address && <span>{content.address}</span>}
                    {content.phone && links.call && (
                      <a href={links.call} className="inline-flex min-h-11 items-center justify-self-start text-white underline decoration-white/30 underline-offset-4">
                        {content.phone}
                      </a>
                    )}
                  </address>
                )}
                {actions.length > 0 ? (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <a
                        key={action.key}
                        href={action.href}
                        {...externalProps(action.href)}
                        className={`${BUTTON} ${i === 0 ? "bg-white text-[#0d1117] hover:bg-[#f6f4f1]" : "border border-white/40 text-white hover:bg-white/10"}`}
                      >
                        {action.label}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-[15px] text-white/75">{noContactNote(content)}</p>
                )}
              </div>
              <div data-reveal style={revealDelay(120)}>
                <MapEmbed content={content} className="min-h-72 rounded-lg border border-white/10 bg-[#161c26]" frameClassName="grayscale-[40%]" />
              </div>
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`${INK} pb-24 text-white lg:pb-0`}>
        <Wrap>
          <div className="flex flex-col gap-3 border-t border-white/10 py-8 text-[13px] text-white/65 sm:flex-row sm:items-baseline sm:justify-between">
            <a href="#top" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-white">
              {content.businessName}
            </a>
            <p className="max-w-md leading-relaxed sm:text-right">{conceptNotice(content, chrome)}</p>
          </div>
        </Wrap>
      </footer>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
