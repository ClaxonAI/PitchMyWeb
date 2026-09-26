import "./dental.css";
import { RevealOnScroll } from "../dental-clinic/Reveal";
import {
  conceptNotice,
  contactActions,
  externalProps,
  formatCount,
  noContactNote,
  pad,
  primaryHref,
  revealDelay,
  servicesNote,
  studioLinks,
  visitSteps,
  type StudioProps,
} from "../studio/common";
import { ConceptRibbon, FloatingWhatsApp, MapEmbed } from "../studio/parts";

// "The Journal": the clinic presented like a well-set magazine feature. Cream
// newsprint, charcoal ink, one terracotta accent, Fraunces for display and a
// drop cap on the introduction. The treatment list is the issue's index; the
// Google rating is the pull quote's figure (never a made-up quote); the FAQ
// is set as an interview. Nothing on the page is invented: no issue numbers,
// no dates, no named dentists.

const DISPLAY = "font-[family-name:var(--font-fraunces)] [font-optical-sizing:auto]";
const RULE = "border-[#1f2a2e]/15";
const MUTED = "text-[#4a5457]";
const ACCENT = "text-[#b4452f]";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[80rem] px-5 sm:px-10 ${className}`}>{children}</div>;
}

function SectionHead({ number, label, children }: { number: string; label: string; children: React.ReactNode }) {
  return (
    <div className={`grid gap-4 border-t-2 border-[#1f2a2e] pt-5 md:grid-cols-[10rem_1fr] md:gap-10`} data-reveal>
      <p className="text-[12px] font-semibold tracking-[0.2em] uppercase">
        <span className={ACCENT}>{number}</span> — {label}
      </p>
      <h2 className={`${DISPLAY} text-[clamp(2.1rem,4.6vw,3.8rem)] leading-[1.02] font-light tracking-[-0.02em]`}>{children}</h2>
    </div>
  );
}

function TextLink({ href, children, strong = false }: { href: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={
        strong
          ? "inline-flex min-h-12 items-center gap-3 bg-[#1f2a2e] px-6 text-[14px] font-semibold tracking-[0.06em] text-[#f3efe6] uppercase transition-colors hover:bg-[#b4452f]"
          : "inline-flex min-h-12 items-center gap-2 border-b border-[#1f2a2e] text-[14px] font-semibold tracking-[0.06em] uppercase transition-colors hover:border-[#b4452f] hover:text-[#b4452f]"
      }
    >
      {children}
      <span aria-hidden>→</span>
    </a>
  );
}

export function DentalEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#directory");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;
  const initial = content.intro.charAt(0);
  const introRest = content.intro.slice(1);

  return (
    <div className="dent-journal min-h-dvh bg-[#f3efe6] font-sans text-[#1f2a2e] antialiased [overflow-wrap:break-word]" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#1f2a2e", color: "rgba(243,239,230,.72)", strong: "#f3efe6", accent: "#d8745d" }} />

      <header className="sticky top-0 z-40 border-b border-[#1f2a2e]/15 bg-[#f3efe6]/95 backdrop-blur-sm">
        <Wrap>
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className={`${DISPLAY} min-h-11 min-w-0 truncate pt-2.5 text-[22px] italic`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden md:block">
              <ul className="flex items-center gap-8 text-[12px] font-semibold tracking-[0.18em] uppercase">
                <li>
                  <a href="#index" className="hover:text-[#b4452f]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#visit" className="hover:text-[#b4452f]">
                    {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#interview" className="hover:text-[#b4452f]">
                      Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#directory" className="hover:text-[#b4452f]">
                    Directory
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center bg-[#1f2a2e] px-4 text-[12px] font-semibold tracking-[0.12em] text-[#f3efe6] uppercase transition-colors hover:bg-[#b4452f]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="pt-10 pb-16 md:pt-16 md:pb-24" data-section="hero">
          <Wrap>
            <div className={`flex flex-wrap items-baseline justify-between gap-2 border-b ${RULE} pb-3 text-[12px] font-semibold tracking-[0.2em] uppercase`} data-reveal>
              <span>{chrome.noun}</span>
              <span className={MUTED}>{content.area ?? "Notes on care"}</span>
            </div>
            <h1 className={`${DISPLAY} mt-8 text-[clamp(3rem,9.5vw,8.6rem)] leading-[0.92] font-light tracking-[-0.045em]`} data-reveal style={revealDelay(80)}>
              {content.businessName}
            </h1>
            <div className="mt-10 grid gap-10 md:grid-cols-[1fr_1.35fr] md:gap-16">
              <p className={`${DISPLAY} text-[clamp(1.5rem,2.6vw,2.2rem)] leading-[1.18] font-light italic`} data-reveal style={revealDelay(140)}>
                {content.tagline}.
              </p>
              <div data-reveal style={revealDelay(200)}>
                <p className="dent-dropcap max-w-2xl text-[17px] leading-[1.75]">
                  <span className={`${DISPLAY} ${ACCENT}`}>{initial}</span>
                  {introRest}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-6">
                  <TextLink href={cta} strong>
                    {chrome.cta}
                  </TextLink>
                  <TextLink href="#index">Read the index</TextLink>
                </div>
              </div>
            </div>
          </Wrap>
        </section>

        {content.rating !== undefined && (
          <section className="bg-[#1f2a2e] py-16 text-[#f3efe6] md:py-24" aria-label={chrome.ratingLabel} data-section="rating">
            <Wrap>
              <figure className="grid items-end gap-8 md:grid-cols-[auto_1fr] md:gap-14" data-reveal>
                <p className={`${DISPLAY} text-[clamp(6rem,17vw,13rem)] leading-[0.8] font-light tracking-[-0.06em] text-[#d8745d]`}>
                  {content.rating.toFixed(1)}
                </p>
                <figcaption className="max-w-xl border-l border-[#f3efe6]/25 pl-6">
                  <p className={`${DISPLAY} text-[clamp(1.4rem,2.4vw,2rem)] leading-snug font-light italic`}>out of five. {chrome.ratingLabel}.</p>
                  {content.reviewCount ? (
                    <p className="mt-4 text-[13px] font-semibold tracking-[0.18em] text-[#f3efe6]/70 uppercase">
                      {formatCount(content.reviewCount)} {chrome.reviewsLabel}
                    </p>
                  ) : null}
                </figcaption>
              </figure>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 py-16 md:py-24" id="index" data-section="services">
          <Wrap>
            <SectionHead number="I" label={chrome.servicesKicker}>
              {chrome.servicesTitle} <em className={`${ACCENT} italic`}>{chrome.servicesEm}</em>
            </SectionHead>
            {note && <p className={`mt-6 max-w-2xl text-[15px] leading-relaxed md:ml-[12.5rem] ${MUTED}`}>{note}</p>}
            <ol className="mt-10 md:ml-[12.5rem]">
              {content.services.map((service, i) => (
                <li key={service.title} className={`group grid gap-2 border-t ${RULE} py-7 sm:grid-cols-[4rem_1fr_1.2fr] sm:gap-8`} data-reveal style={revealDelay((i % 3) * 80)}>
                  <span className={`${DISPLAY} text-[28px] leading-none font-light ${ACCENT}`}>{pad(i)}</span>
                  <h3 className={`${DISPLAY} text-[26px] leading-tight font-normal transition-colors group-hover:text-[#b4452f]`}>{service.title}</h3>
                  <p className={`text-[15.5px] leading-relaxed ${MUTED}`}>{service.description}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        <section className={`scroll-mt-20 border-t ${RULE} bg-[#ebe5d8] py-16 md:py-24`} id="visit" data-section="visit">
          <Wrap>
            <SectionHead number="II" label={chrome.visitKicker}>
              {chrome.visitTitle}
            </SectionHead>
            <ol className="mt-12 grid gap-10 md:ml-[12.5rem] md:grid-cols-3 md:gap-8">
              {steps.map((step, i) => (
                <li key={step.title} data-reveal style={revealDelay(i * 110)}>
                  <p className={`${DISPLAY} text-[64px] leading-none font-light italic ${ACCENT}`}>{i + 1}.</p>
                  <h3 className={`${DISPLAY} mt-4 text-[24px] leading-tight`}>{step.title}</h3>
                  <p className={`mt-3 text-[15.5px] leading-relaxed ${MUTED}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-20 py-16 md:py-24" id="interview" data-section="faq">
            <Wrap>
              <SectionHead number="III" label="In conversation">
                Questions, <em className={`${ACCENT} italic`}>answered plainly.</em>
              </SectionHead>
              <div className="mt-10 grid gap-10 md:ml-[12.5rem]" data-reveal style={revealDelay(100)}>
                {content.faqs.map((faq) => (
                  <div key={faq.question} className="max-w-3xl">
                    <p className={`${DISPLAY} text-[22px] leading-snug font-normal`}>
                      <span className={`mr-2 font-semibold ${ACCENT}`}>Q.</span>
                      {faq.question}
                    </p>
                    <p className={`mt-3 border-l-2 border-[#b4452f]/40 pl-5 text-[16px] leading-relaxed ${MUTED}`}>{faq.answer}</p>
                  </div>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 bg-[#1f2a2e] py-16 text-[#f3efe6] md:py-24" id="directory" data-section="contact">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-[1.1fr_.9fr]">
              <div data-reveal>
                <p className="text-[12px] font-semibold tracking-[0.2em] text-[#d8745d] uppercase">{hasFaq ? "IV" : "III"} — Directory</p>
                <h2 className={`${DISPLAY} mt-5 text-[clamp(2.2rem,4.8vw,4rem)] leading-[1.02] font-light tracking-[-0.02em]`}>
                  {chrome.closingTitle} <em className="text-[#d8745d] italic">{chrome.closingEm}</em>
                </h2>
                <dl className="mt-10 grid gap-6 border-t border-[#f3efe6]/20 pt-6 text-[15.5px] sm:grid-cols-2">
                  {content.address && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold tracking-[0.2em] text-[#f3efe6]/60 uppercase">Address</dt>
                      <dd className="mt-2 leading-relaxed">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className="text-[11px] font-semibold tracking-[0.2em] text-[#f3efe6]/60 uppercase">Telephone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className="underline decoration-[#d8745d] underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[11px] font-semibold tracking-[0.2em] text-[#f3efe6]/60 uppercase">Hours</dt>
                    <dd className="mt-2">Message or call to confirm today&apos;s hours</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <a
                        key={action.key}
                        href={action.href}
                        {...externalProps(action.href)}
                        className={`inline-flex min-h-12 items-center justify-center px-6 text-[13px] font-semibold tracking-[0.12em] uppercase transition-colors ${
                          i === 0 ? "bg-[#d8745d] text-[#1f2a2e] hover:bg-[#e58a74]" : "border border-[#f3efe6]/35 hover:border-[#f3efe6]"
                        }`}
                      >
                        {action.label}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-10 text-[15px] text-[#f3efe6]/75">{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className="min-h-80 border border-[#f3efe6]/20 lg:h-full" frameClassName="grayscale sepia-[.25] contrast-[1.05]" />
                </div>
              ) : null}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t border-[#1f2a2e]/15 pb-24 lg:pb-0">
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-baseline sm:justify-between ${MUTED}`}>
          <a href="#top" className={`${DISPLAY} inline-flex min-h-11 items-center self-start text-[22px] text-[#1f2a2e] italic`}>
            {content.businessName}
          </a>
          <p className="max-w-md leading-relaxed sm:text-right">{conceptNotice(content, chrome)}</p>
        </Wrap>
      </footer>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
