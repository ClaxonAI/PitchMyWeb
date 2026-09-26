import "./gym.css";
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

// "Race Poster": the gym as a Swiss sports poster. Chalk-white paper, black
// heavy italics, safety red and racing stripes that slide across the hero.
// The training list reads as a numbered drill sheet; the rating sits in a
// stamp. Loud type, calm facts — nothing about members or results invented.

const SANS = "font-[family-name:var(--font-manrope)]";
const RED = "text-[#e0301e]";
const SOFT = "text-[#111]/70";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[84rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center gap-3 px-7 text-[14px] font-extrabold tracking-[0.04em] uppercase italic transition-colors ${
        solid ? "bg-[#e0301e] text-white hover:bg-[#111]" : "border-2 border-[#111] text-[#111] hover:bg-[#111] hover:text-[#efeeea]"
      }`}
    >
      {children}
      <span aria-hidden>→</span>
    </a>
  );
}

function Stripes({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`poster-stripes h-5 ${className}`} />;
}

export function GymEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#get-in");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`gym-poster min-h-dvh bg-[#efeeea] ${SANS} text-[#111] antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#111111", color: "rgba(255,255,255,.7)", strong: "#ffffff", accent: "#e0301e" }} />

      <header className="sticky top-0 z-40 border-b-[3px] border-[#111] bg-[#efeeea]">
        <Wrap>
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className="min-h-11 min-w-0 truncate pt-2.5 text-[20px] font-extrabold tracking-[-0.02em] uppercase italic">
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-7 text-[13px] font-extrabold uppercase italic">
                <li>
                  <a href="#drills" className="hover:text-[#e0301e]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#start" className="hover:text-[#e0301e]">
                    {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#faq" className="hover:text-[#e0301e]">
                      FAQ
                    </a>
                  </li>
                )}
                <li>
                  <a href="#get-in" className="hover:text-[#e0301e]">
                    Find the floor
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center bg-[#e0301e] px-4 text-[13px] font-extrabold text-white uppercase italic transition-colors hover:bg-[#111]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="relative overflow-hidden pt-10 pb-14 md:pt-16 md:pb-20" data-section="hero">
          <Wrap>
            <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] font-extrabold uppercase italic" data-reveal>
              <span className="bg-[#111] px-2.5 py-1 text-[#efeeea]">{chrome.noun}</span>
              <span className={RED}>{content.area ?? "Open floor"}</span>
            </div>
            <h1
              className={`mt-6 ${content.businessName.length > 22 ? "text-[clamp(2.6rem,7vw,6rem)]" : "text-[clamp(3.6rem,12vw,11rem)]"} leading-[0.84] font-extrabold tracking-[-0.05em] uppercase italic`}
              data-reveal
              style={revealDelay(80)}
            >
              {content.businessName}
            </h1>
          </Wrap>
          <Stripes className="poster-slide mt-8" />
          <Wrap>
            <div className="mt-10 grid gap-10 md:grid-cols-[1.3fr_1fr] md:items-end">
              <div data-reveal style={revealDelay(140)}>
                <p className="text-[clamp(1.6rem,3vw,2.6rem)] leading-[1.02] font-extrabold tracking-[-0.03em] uppercase italic">{content.tagline}</p>
                <p className={`mt-5 max-w-xl text-[17px] leading-relaxed ${SOFT}`}>{content.intro}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta} solid>
                    {chrome.cta}
                  </Button>
                  <Button href="#drills">See {chrome.navServices.toLowerCase()}</Button>
                </div>
              </div>
              {content.rating !== undefined && (
                <div className="md:justify-self-end" data-reveal style={revealDelay(200)}>
                  <div className="poster-stamp grid size-44 place-items-center rounded-full bg-[#e0301e] text-center text-white">
                    <div>
                      <p className="text-[58px] leading-none font-extrabold tracking-[-0.05em] italic">{content.rating.toFixed(1)}</p>
                      <p className="mt-1 px-6 text-[10.5px] leading-tight font-extrabold tracking-[0.1em] uppercase">
                        {content.reviewCount ? `${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : chrome.ratingLabel}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-20 border-t-[3px] border-[#111] bg-white py-16 md:py-24" id="drills" data-section="services">
          <Wrap>
            <div className="grid gap-6 md:grid-cols-[1fr_1.4fr] md:items-end" data-reveal>
              <h2 className="text-[clamp(2.4rem,5.4vw,4.8rem)] leading-[0.9] font-extrabold tracking-[-0.045em] uppercase italic">
                {chrome.servicesTitle} <span className={RED}>{chrome.servicesEm}</span>
              </h2>
              <p className={`text-[15.5px] leading-relaxed md:justify-self-end md:text-right ${SOFT}`}>{note ?? `What ${content.businessName} runs on the floor.`}</p>
            </div>
            <ol className="mt-12 border-t-[3px] border-[#111]">
              {content.services.map((service, i) => (
                <li
                  key={service.title}
                  className="group grid grid-cols-[4.5rem_1fr] items-baseline gap-4 border-b border-[#111]/20 py-6 transition-colors hover:bg-[#efeeea] md:grid-cols-[7rem_1fr_1.2fr] md:gap-8"
                  data-reveal
                  style={revealDelay((i % 3) * 70)}
                >
                  <span className="text-[40px] leading-none font-extrabold tracking-[-0.05em] italic text-[#e0301e] md:text-[56px]">{pad(i)}</span>
                  <h3 className="text-[24px] leading-tight font-extrabold tracking-[-0.02em] uppercase italic">{service.title}</h3>
                  <p className={`col-start-2 text-[15.5px] leading-relaxed md:col-start-3 ${SOFT}`}>{service.description}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        <section className="scroll-mt-20 bg-[#111] py-16 text-[#efeeea] md:py-24" id="start" data-section="visit">
          <Wrap>
            <div data-reveal>
              <p className="text-[13px] font-extrabold tracking-[0.1em] text-[#e0301e] uppercase italic">{chrome.visitKicker}</p>
              <h2 className="mt-4 max-w-4xl text-[clamp(2.2rem,5vw,4.4rem)] leading-[0.92] font-extrabold tracking-[-0.04em] uppercase italic">{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="relative overflow-hidden border-2 border-[#efeeea]/20 p-7" data-reveal style={revealDelay(i * 100)}>
                  <span aria-hidden className="absolute -top-4 -right-2 text-[110px] leading-none font-extrabold italic text-[#efeeea]/[0.07]">
                    {i + 1}
                  </span>
                  <p className="text-[13px] font-extrabold text-[#e0301e] uppercase italic">Step {i + 1}</p>
                  <h3 className="mt-3 text-[26px] font-extrabold tracking-[-0.02em] uppercase italic">{step.title}</h3>
                  <p className="mt-2 text-[15.5px] leading-relaxed text-[#efeeea]/75">{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>
        <Stripes />

        {hasFaq && (
          <section className="scroll-mt-20 py-16 md:py-24" id="faq" data-section="faq">
            <Wrap className="max-w-[60rem]">
              <h2 className="text-[clamp(2.2rem,5vw,4rem)] leading-[0.92] font-extrabold tracking-[-0.04em] uppercase italic" data-reveal>
                Quick <span className={RED}>answers.</span>
              </h2>
              <div className="mt-8 border-t-[3px] border-[#111]" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className="group border-b border-[#111]/20" open={i === 0}>
                    <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-[19px] font-extrabold tracking-[-0.01em] uppercase italic">
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[26px] transition-transform group-open:rotate-45 ${RED}`}>
                        +
                      </span>
                    </summary>
                    <p className={`max-w-2xl pb-6 text-[16px] leading-relaxed ${SOFT}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 border-t-[3px] border-[#111] bg-white py-16 md:py-24" id="get-in" data-section="contact">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-2">
              <div data-reveal>
                <h2 className="text-[clamp(2.2rem,5vw,4.2rem)] leading-[0.92] font-extrabold tracking-[-0.04em] uppercase italic">
                  {chrome.closingTitle} <span className={RED}>{chrome.closingEm}</span>
                </h2>
                <dl className="mt-10 grid gap-5 border-t-[3px] border-[#111] pt-6 text-[16px]">
                  {content.address && (
                    <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                      <dt className="text-[13px] font-extrabold uppercase italic">Floor</dt>
                      <dd className={SOFT}>{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                      <dt className="text-[13px] font-extrabold uppercase italic">Phone</dt>
                      <dd>
                        {links.call ? (
                          <a href={links.call} className="font-extrabold underline decoration-[#e0301e] decoration-[3px] underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                    <dt className="text-[13px] font-extrabold uppercase italic">Hours</dt>
                    <dd className={SOFT}>Message or call to confirm today&apos;s hours</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <Button key={action.key} href={action.href} solid={i === 0}>
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className={`mt-10 text-[15px] ${SOFT}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className="min-h-80 border-[3px] border-[#111] lg:h-full" frameClassName="grayscale contrast-[1.2]" />
                </div>
              ) : (
                <div aria-hidden className="poster-stripes hidden lg:block" />
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t-[3px] border-[#111] pb-24 lg:pb-0">
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${SOFT}`}>
          <a href="#top" className="inline-flex min-h-11 items-center self-start text-[18px] font-extrabold text-[#111] uppercase italic">
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
