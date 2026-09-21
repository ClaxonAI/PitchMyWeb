import "./clinic.css";
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
} from "./common";
import { ConceptRibbon, FloatingWhatsApp, MapEmbed } from "./parts";

// sachu45 "clinic" (Verrin Cardiology) design on scrape facts: warm beige
// page, serif display type, crimson section numbers, hairline rules. The
// original's consultant biography, fee tables, portrait and patient
// testimonials are not used — they would be invented for a real clinic. The
// sections are the service list, the visit steps, the real Google rating and
// the FAQ. Colours are literal values so the design does not depend on the
// shared site tokens; the muted and crimson text tones are darkened from the
// original so small copy passes WCAG AA on the beige page.

const SERIF = "font-[family-name:var(--font-instrument)] [font-variant-numeric:lining-nums]";
const MUTED = "text-[#625e55]";
const RED = "text-[#b02a33]";
const DISPLAY_H2 = `${SERIF} mt-5 text-[clamp(2.25rem,4.4vw,3.5rem)] font-normal leading-[1.06] tracking-[-0.012em]`;

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[82rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Label({ number, label, dark = false }: { number: string; label: string; dark?: boolean }) {
  return (
    <p className="flex items-center gap-3 text-[13px]">
      <span aria-hidden className={`h-px w-6 ${dark ? "bg-[#d9545c]" : "bg-[#b02a33]"}`} />
      <span className={dark ? "text-[#e0737a]" : RED}>{number}</span>
      <span className={dark ? "text-white/85" : "text-[#1a1a18]"}>{label}</span>
    </p>
  );
}

function Pill({ href, children, solid = false, className = "" }: { href: string; children: React.ReactNode; solid?: boolean; className?: string }) {
  const styles = solid
    ? "bg-[#1a1a18] text-white hover:bg-[#1a1a18]/85"
    : "border border-[#1a1a18]/30 text-[#1a1a18] hover:border-[#1a1a18]/70";
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] transition-colors ${styles} ${className}`}
    >
      {children}
    </a>
  );
}

export function ClinicStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#find-us");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);

  return (
    <div className="clinic-studio min-h-dvh bg-[#eae6dc] font-sans text-[#1a1a18] antialiased [overflow-wrap:break-word]" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#141312", color: "rgba(255,255,255,.72)", strong: "#ffffff", accent: "#d9545c" }} />
      <header className="sticky top-0 z-40 border-b border-[#1a1a18]/10 bg-[#f3f0e9] lg:bg-[#f3f0e9]/95 lg:backdrop-blur">
        <Wrap>
          <div className="flex h-[68px] items-center justify-between gap-4">
            <a href="#top" className="flex min-h-11 min-w-0 items-center">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className={`${SERIF} truncate text-[22px] leading-none`}>{content.businessName}</span>
                <span className={`hidden shrink-0 text-[13px] leading-none sm:inline ${MUTED}`}>{chrome.noun}</span>
              </span>
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-9 text-[14px]">
                {[
                  [chrome.navServices, "#care"],
                  [chrome.navVisit, "#visit"],
                  ...(content.faqs.length > 0 ? [["Questions", "#questions"]] : []),
                  ["Contact", "#find-us"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <a href={href} className="transition-colors hover:text-[#b02a33]">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex shrink-0 items-center gap-5">
              {content.phone && links.call && (
                <a href={links.call} className={`${SERIF} hidden min-h-11 items-center gap-2.5 text-[17px] transition-colors hover:text-[#b02a33] md:flex`}>
                  <span aria-hidden className="size-1.5 rounded-full bg-[#c3303a]" />
                  {content.phone}
                </a>
              )}
              <a
                href={cta}
                {...externalProps(cta)}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1a1a18] px-5 text-[14px] text-white transition-colors hover:bg-[#1a1a18]/85"
              >
                <span className="hidden sm:inline">{chrome.cta}</span>
                <span className="sm:hidden">Book</span>
              </a>
            </div>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="border-b border-[#1a1a18]/10 py-16 md:py-28" data-section="hero">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
              <div data-reveal>
                <Label number="01" label={content.area ? `${chrome.noun} · ${content.area}` : chrome.noun} />
                <h1 className={`${SERIF} mt-5 max-w-5xl text-[clamp(2.6rem,6.4vw,4.4rem)] font-normal leading-[1.04] tracking-[-0.015em]`}>{content.tagline}</h1>
                <p className={`mt-7 max-w-2xl text-[16px] leading-relaxed sm:text-[17px] ${MUTED}`}>{content.intro}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Pill href={cta} solid>
                    {chrome.cta}
                  </Pill>
                  <Pill href="#care">See {chrome.navServices.toLowerCase()}</Pill>
                </div>
              </div>
              <div className="border-t border-[#1a1a18]/10 pt-6" data-reveal style={revealDelay(140)}>
                {content.rating !== undefined ? (
                  <>
                    <p className={`text-[13px] ${MUTED}`}>{chrome.ratingLabel}</p>
                    <p className={`${SERIF} mt-4 text-3xl leading-tight md:text-4xl`}>
                      <em className="text-[#c3303a] italic">{content.rating.toFixed(1)}</em> out of 5
                      {content.reviewCount ? ` from ${formatCount(content.reviewCount)} reviews` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className={`text-[13px] ${MUTED}`}>A simpler way to get in touch.</p>
                    <p className={`${SERIF} mt-4 text-3xl leading-tight md:text-4xl`}>
                      One message. <em className="text-[#c3303a] italic">A clear next step.</em>
                    </p>
                  </>
                )}
              </div>
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-20 border-b border-[#1a1a18]/10 py-16 md:py-28" id="care" data-section="services">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-12">
              <div data-reveal>
                <Label number="02" label={chrome.servicesKicker} />
                <h2 className={DISPLAY_H2}>
                  {chrome.servicesTitle} <em className="text-[#c3303a] italic">{chrome.servicesEm}</em>
                </h2>
                <p className={`mt-5 max-w-sm text-[15px] leading-relaxed ${MUTED}`}>{note ?? `What ${content.businessName} offers.`}</p>
              </div>
              <ol>
                {content.services.map((service, i) => (
                  <li
                    key={service.title}
                    data-reveal
                    style={revealDelay((i % 3) * 80)}
                    className="grid gap-2 border-t border-[#1a1a18]/10 py-6 sm:grid-cols-[3rem_1fr] sm:gap-6"
                  >
                    <span className={`text-[13px] ${RED}`}>{pad(i)}</span>
                    <div>
                      <h3 className={`${SERIF} text-2xl leading-tight`}>{service.title}</h3>
                      <p className={`mt-2 max-w-xl text-[15px] leading-relaxed ${MUTED}`}>{service.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-20 bg-[#141312] py-16 text-white md:py-28" id="visit" data-section="visit">
          <Wrap>
            <div data-reveal>
              <Label number="03" label={chrome.visitKicker} dark />
              <h2 className={`${DISPLAY_H2} max-w-3xl`}>{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 md:mt-14 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="bg-[#141312] p-7 sm:p-8" data-reveal style={revealDelay(i * 110)}>
                  <span className="text-[13px] text-[#e0737a]">{pad(i)}</span>
                  <h3 className={`${SERIF} mt-6 text-2xl sm:mt-8`}>{step.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/70">{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {content.faqs.length > 0 && (
          <section className="scroll-mt-20 border-b border-[#1a1a18]/10 py-16 md:py-28" id="questions" data-section="faq">
            <Wrap>
              <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-12">
                <div data-reveal>
                  <Label number="04" label="Questions" />
                  <h2 className={DISPLAY_H2}>
                    Good to <em className="text-[#c3303a] italic">know.</em>
                  </h2>
                </div>
                <div data-reveal style={revealDelay(100)}>
                  {content.faqs.map((faq, i) => (
                    <details key={faq.question} className="group border-t border-[#1a1a18]/10 last:border-b" open={i === 0}>
                      <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-xl`}>
                        {faq.question}
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-[#1a1a18]/20 text-[#b02a33] transition-transform group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <p className={`max-w-xl pr-12 pb-6 text-[15.5px] leading-relaxed ${MUTED}`}>{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 py-16 md:py-28" id="find-us" data-section="contact">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
              <div data-reveal>
                <Label number={content.faqs.length > 0 ? "05" : "04"} label="Find us" />
                <h2 className={DISPLAY_H2}>
                  {chrome.closingTitle} <em className="text-[#c3303a] italic">{chrome.closingEm}</em>
                </h2>
                <dl className="mt-10">
                  {content.address && (
                    <div className="grid gap-1.5 border-t border-[#1a1a18]/10 py-5 sm:grid-cols-[7rem_1fr] sm:gap-6">
                      <dt className={`text-[13px] ${MUTED}`}>Address</dt>
                      <dd className="text-[15px] leading-relaxed">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div className="grid gap-1.5 border-t border-[#1a1a18]/10 py-5 sm:grid-cols-[7rem_1fr] sm:gap-6">
                      <dt className={`text-[13px] ${MUTED}`}>Phone</dt>
                      <dd className="text-[15px] leading-relaxed">
                        {links.call ? (
                          <a href={links.call} className="underline decoration-[#1a1a18]/25 underline-offset-4 hover:text-[#b02a33]">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div className="grid gap-1.5 border-t border-b border-[#1a1a18]/10 py-5 sm:grid-cols-[7rem_1fr] sm:gap-6">
                    <dt className={`text-[13px] ${MUTED}`}>Hours</dt>
                    <dd className="text-[15px] leading-relaxed">Message or call to confirm today&apos;s hours</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <Pill key={action.key} href={action.href} solid={i === 0}>
                        {action.label}
                      </Pill>
                    ))}
                  </div>
                ) : (
                  <p className={`mt-8 text-[15px] ${MUTED}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className="min-h-80 rounded-2xl border border-[#1a1a18]/10 bg-[#f3f0e9] lg:h-full" frameClassName="grayscale-[35%] contrast-[1.05]" />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="relative hidden min-h-72 rounded-2xl bg-[#f3f0e9] [background-image:radial-gradient(circle,rgba(26,26,24,0.18)_1px,transparent_1px)] [background-size:15px_15px] lg:block"
                >
                  <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c3303a] shadow-[0_0_0_10px_rgba(195,48,58,0.15)]" />
                </div>
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t border-[#1a1a18]/10 bg-[#f3f0e9] pb-24 lg:pb-0">
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-baseline sm:justify-between ${MUTED}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center self-start text-[20px] text-[#1a1a18]`}>
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
