import "./clinic.css";
import { RevealOnScroll } from "../dental-clinic/Reveal";
import {
  conceptNotice,
  contactActions,
  externalProps,
  formatCount,
  noContactNote,
  primaryHref,
  revealDelay,
  servicesNote,
  studioLinks,
  visitSteps,
  type StudioProps,
} from "../studio/common";
import { ConceptRibbon, FloatingWhatsApp, MapEmbed } from "../studio/parts";

// "Sanctuary": a clinic that feels like a calm place to be looked after.
// Warm sand, deep sage and a little clay; Instrument Serif; the arch — a
// doorway, a window — as the one recurring shape, from the hero to the care
// cards. Soft, unhurried, and still only the facts discovery found.

const SERIF = "font-[family-name:var(--font-instrument)]";
const SAGE = "text-[#33443a]";
const SOFT = "text-[#33443a]/70";
const CLAY = "text-[#a5623f]";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[76rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Leaf({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z" />
      <path d="M5 19c3-4 6-7 10-9" />
    </svg>
  );
}

function Pill({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-7 text-[15px] transition-colors ${
        solid ? "bg-[#33443a] text-[#f6f1e8] hover:bg-[#2a382f]" : "border border-[#33443a]/30 text-[#33443a] hover:border-[#33443a]"
      }`}
    >
      {children}
    </a>
  );
}

export function ClinicAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#come-in");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`clinic-sanctum min-h-dvh bg-[#efe9df] font-[family-name:var(--font-hanken)] ${SAGE} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#33443a", color: "rgba(246,241,232,.72)", strong: "#f6f1e8", accent: "#d69a78" }} />

      <header className="sticky top-0 z-40 bg-[#efe9df]/90 backdrop-blur-md">
        <Wrap>
          <div className="flex h-[72px] items-center justify-between gap-4 border-b border-[#33443a]/12">
            <a href="#top" className={`${SERIF} flex min-h-11 min-w-0 items-center gap-2.5 text-[24px] leading-none`}>
              <Leaf className={`size-6 shrink-0 ${CLAY}`} />
              <span className="truncate">{content.businessName}</span>
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-8 text-[14px]">
                <li>
                  <a href="#care" className="hover:text-[#a5623f]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#visit" className="hover:text-[#a5623f]">
                    {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#questions" className="hover:text-[#a5623f]">
                      Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#come-in" className="hover:text-[#a5623f]">
                    Find us
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#33443a] px-5 text-[14px] text-[#f6f1e8] transition-colors hover:bg-[#2a382f]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="py-12 md:py-20" data-section="hero">
          <Wrap>
            <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
              <div data-reveal>
                <p className={`flex items-center gap-2 text-[13px] tracking-[0.14em] uppercase ${CLAY}`}>
                  <Leaf className="size-4" />
                  {content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}
                </p>
                <h1 className={`${SERIF} mt-6 text-[clamp(3rem,7.4vw,6.2rem)] leading-[0.96] tracking-[-0.02em]`}>{content.businessName}</h1>
                <p className={`${SERIF} mt-5 text-[clamp(1.4rem,2.4vw,2rem)] leading-snug italic ${CLAY}`}>{content.tagline}</p>
                <p className={`mt-6 max-w-lg text-[17px] leading-relaxed ${SOFT}`}>{content.intro}</p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Pill href={cta} solid>
                    {chrome.cta}
                  </Pill>
                  <Pill href="#care">Explore {chrome.navServices.toLowerCase()}</Pill>
                </div>
              </div>
              <div aria-hidden className="relative mx-auto w-full max-w-[26rem]" data-reveal style={revealDelay(160)}>
                <div className="sanctum-arch relative aspect-[4/5] overflow-hidden rounded-t-full bg-[linear-gradient(180deg,#c9d3c0_0%,#8a9a82_58%,#5f7263_100%)]">
                  <div className="absolute inset-x-[14%] top-[16%] bottom-0 rounded-t-full border border-[#f6f1e8]/40" />
                  <div className="sanctum-sun absolute top-[22%] left-1/2 size-24 -translate-x-1/2 rounded-full bg-[#f3d9bf]/80 blur-[1px]" />
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(180deg,transparent,rgba(51,68,58,.55))]" />
                  <Leaf className="absolute bottom-8 left-1/2 size-12 -translate-x-1/2 text-[#f6f1e8]/80" />
                </div>
                {content.rating !== undefined && (
                  <div className="absolute -bottom-6 -left-4 rounded-3xl bg-[#f6f1e8] px-5 py-4 shadow-[0_24px_50px_-30px_rgba(51,68,58,.7)] sm:-left-10">
                    <p className={`${SERIF} text-[40px] leading-none`}>{content.rating.toFixed(1)}</p>
                    <p className={`mt-1 text-[12px] ${SOFT}`}>{content.reviewCount ? `${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : chrome.ratingLabel}</p>
                  </div>
                )}
              </div>
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-24 py-16 md:py-24" id="care" data-section="services">
          <Wrap>
            <div className="mx-auto max-w-2xl text-center" data-reveal>
              <p className={`text-[13px] tracking-[0.14em] uppercase ${CLAY}`}>{chrome.servicesKicker}</p>
              <h2 className={`${SERIF} mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.05]`}>
                {chrome.servicesTitle} <em className={`italic ${CLAY}`}>{chrome.servicesEm}</em>
              </h2>
              {note && <p className={`mt-4 text-[15px] leading-relaxed ${SOFT}`}>{note}</p>}
            </div>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {content.services.map((service, i) => (
                <li key={service.title} className="rounded-t-[10rem] rounded-b-3xl bg-[#f6f1e8] px-7 pt-12 pb-8 text-center" data-reveal style={revealDelay((i % 3) * 90)}>
                  <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-[#e3e8dc] text-[#5f7263]">
                    <Leaf className="size-6" />
                  </span>
                  <h3 className={`${SERIF} mt-5 text-[26px] leading-tight`}>{service.title}</h3>
                  <p className={`mt-3 text-[15px] leading-relaxed ${SOFT}`}>{service.description}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-24 bg-[#33443a] py-16 text-[#f6f1e8] md:py-24" id="visit" data-section="visit">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
              <div data-reveal>
                <p className="text-[13px] tracking-[0.14em] text-[#d69a78] uppercase">{chrome.visitKicker}</p>
                <h2 className={`${SERIF} mt-4 text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.05]`}>{chrome.visitTitle}</h2>
              </div>
              <ol className="relative grid gap-8 border-l border-[#f6f1e8]/20 pl-8">
                {steps.map((step, i) => (
                  <li key={step.title} className="relative" data-reveal style={revealDelay(i * 110)}>
                    <span aria-hidden className="absolute top-1.5 -left-[2.4rem] size-3 rounded-full bg-[#d69a78] ring-4 ring-[#33443a]" />
                    <p className="text-[13px] tracking-[0.14em] text-[#f6f1e8]/55 uppercase">Step {i + 1}</p>
                    <h3 className={`${SERIF} mt-1 text-[28px]`}>{step.title}</h3>
                    <p className="mt-2 max-w-md text-[15.5px] leading-relaxed text-[#f6f1e8]/75">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-24 py-16 md:py-24" id="questions" data-section="faq">
            <Wrap className="max-w-[54rem]">
              <div className="text-center" data-reveal>
                <p className={`text-[13px] tracking-[0.14em] uppercase ${CLAY}`}>Questions</p>
                <h2 className={`${SERIF} mt-4 text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.05]`}>
                  Gentle <em className={`italic ${CLAY}`}>answers.</em>
                </h2>
              </div>
              <div className="mt-10 grid gap-3" data-reveal style={revealDelay(90)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className="group rounded-[1.75rem] bg-[#f6f1e8] px-7" open={i === 0}>
                    <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-[22px]`}>
                      {faq.question}
                      <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full bg-[#e3e8dc] transition-transform group-open:rotate-45 ${CLAY}`}>
                        +
                      </span>
                    </summary>
                    <p className={`pb-6 text-[15.5px] leading-relaxed ${SOFT}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-24 pb-16 md:pb-24" id="come-in" data-section="contact">
          <Wrap>
            <div className="grid overflow-hidden rounded-[2.5rem] bg-[#f6f1e8] lg:grid-cols-2">
              <div className="p-8 sm:p-12" data-reveal>
                <p className={`text-[13px] tracking-[0.14em] uppercase ${CLAY}`}>Find us</p>
                <h2 className={`${SERIF} mt-4 text-[clamp(2.1rem,4vw,3.2rem)] leading-[1.05]`}>
                  {chrome.closingTitle} <em className={`italic ${CLAY}`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-8 grid gap-5 text-[15.5px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[12px] tracking-[0.14em] uppercase ${CLAY}`}>Address</dt>
                      <dd className="mt-1 leading-relaxed">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[12px] tracking-[0.14em] uppercase ${CLAY}`}>Phone</dt>
                      <dd className="mt-1">
                        {links.call ? (
                          <a href={links.call} className="underline decoration-[#a5623f]/50 underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[12px] tracking-[0.14em] uppercase ${CLAY}`}>Hours</dt>
                    <dd className="mt-1">Message or call to confirm today&apos;s hours</dd>
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
                  <p className={`mt-8 text-[15px] ${SOFT}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <MapEmbed content={content} className="min-h-80 lg:rounded-l-[2.5rem]" frameClassName="sepia-[.3] saturate-[.8]" />
              ) : (
                <div aria-hidden className="hidden bg-[linear-gradient(180deg,#c9d3c0,#8a9a82)] lg:block" />
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t border-[#33443a]/12 pb-24 lg:pb-0">
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${SOFT}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center self-start text-[22px] text-[#33443a]`}>
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
