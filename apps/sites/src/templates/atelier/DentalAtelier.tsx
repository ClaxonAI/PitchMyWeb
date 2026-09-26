import "./dental.css";
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

// "Atelier": the clinic as a quiet private practice. Deep teal-black, a
// champagne hairline and Cormorant Garamond set large and light; a framed
// monogram in the hero built from the clinic's own initials; treatments as a
// ruled list with roman numerals. Premium through restraint — generous space,
// thin rules, one metallic accent — and still only the facts we were given.

const SERIF = "font-[family-name:var(--font-cormorant)]";
const GOLD = "text-[#c9a96e]";
const SOFT = "text-[#ece6da]/70";
const LINE = "border-[#c9a96e]/25";
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[74rem] px-6 sm:px-10 ${className}`}>{children}</div>;
}

/** Up to two initials from the business name, for the monogram. */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
  const letters = (words.length > 1 ? [words[0]!, words[1]!] : words.slice(0, 1)).map((word) => word[0]!.toUpperCase());
  return letters.join("") || name.charAt(0).toUpperCase();
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className={`flex items-center justify-center gap-4 text-[11px] font-medium tracking-[0.42em] uppercase ${GOLD}`}>
      <span aria-hidden className="h-px w-10 bg-[#c9a96e]/60" />
      {children}
      <span aria-hidden className="h-px w-10 bg-[#c9a96e]/60" />
    </p>
  );
}

function GoldButton({ href, children, outline = false }: { href: string; children: React.ReactNode; outline?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center px-8 text-[12px] font-medium tracking-[0.28em] uppercase transition-colors ${
        outline ? "border border-[#c9a96e]/50 text-[#ece6da] hover:border-[#c9a96e] hover:text-[#c9a96e]" : "bg-[#c9a96e] text-[#0f1a1d] hover:bg-[#d9bd88]"
      }`}
    >
      {children}
    </a>
  );
}

export function DentalAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#appointments");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className="dent-atelier min-h-dvh bg-[#0f1a1d] font-sans text-[#ece6da] antialiased [overflow-wrap:break-word]" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#0a1214", color: "rgba(236,230,218,.62)", strong: "#ece6da", accent: "#c9a96e" }} />

      <header className="sticky top-0 z-40 border-b border-[#c9a96e]/15 bg-[#0f1a1d]/92 backdrop-blur-md">
        <Wrap>
          <div className="flex h-[72px] items-center justify-between gap-4">
            <a href="#top" className={`${SERIF} flex min-h-11 min-w-0 items-center gap-3 text-[22px] font-medium tracking-[0.04em]`}>
              <span aria-hidden className={`grid size-9 shrink-0 place-items-center border ${LINE} text-[15px] ${GOLD}`}>
                {initials(content.businessName)}
              </span>
              <span className="truncate">{content.businessName}</span>
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-9 text-[11px] font-medium tracking-[0.3em] uppercase">
                <li>
                  <a href="#treatments" className="transition-colors hover:text-[#c9a96e]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#experience" className="transition-colors hover:text-[#c9a96e]">
                    {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#enquiries" className="transition-colors hover:text-[#c9a96e]">
                      Enquiries
                    </a>
                  </li>
                )}
                <li>
                  <a href="#appointments" className="transition-colors hover:text-[#c9a96e]">
                    Appointments
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center border border-[#c9a96e]/60 px-4 text-[11px] font-medium tracking-[0.24em] uppercase transition-colors hover:bg-[#c9a96e] hover:text-[#0f1a1d]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 text-center md:py-32" data-section="hero">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(201,169,110,.16),transparent_60%)]" />
          <Wrap className="relative">
            <div aria-hidden className="atelier-frame mx-auto grid size-36 place-items-center md:size-44" data-reveal>
              <span className={`${SERIF} text-[3.4rem] leading-none font-light md:text-[4.2rem] ${GOLD}`}>{initials(content.businessName)}</span>
            </div>
            <div className="mt-10" data-reveal style={revealDelay(100)}>
              <Eyebrow>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Eyebrow>
            </div>
            <h1 className={`${SERIF} mx-auto mt-7 max-w-4xl text-[clamp(2.8rem,7.4vw,6.2rem)] leading-[0.98] font-light tracking-[-0.01em]`} data-reveal style={revealDelay(160)}>
              {content.businessName}
            </h1>
            <p className={`${SERIF} mx-auto mt-6 max-w-2xl text-[clamp(1.25rem,2.2vw,1.7rem)] leading-snug italic ${GOLD}`} data-reveal style={revealDelay(220)}>
              {content.tagline}
            </p>
            <p className={`mx-auto mt-6 max-w-xl text-[16px] leading-[1.8] ${SOFT}`} data-reveal style={revealDelay(260)}>
              {content.intro}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row" data-reveal style={revealDelay(300)}>
              <GoldButton href={cta}>{chrome.cta}</GoldButton>
              <GoldButton href="#treatments" outline>
                The treatments
              </GoldButton>
            </div>
            {content.rating !== undefined && (
              <p className={`mt-14 text-[12px] tracking-[0.3em] uppercase ${SOFT}`} data-reveal style={revealDelay(340)}>
                <span className={`${SERIF} mr-2 text-[22px] tracking-normal normal-case ${GOLD}`}>{content.rating.toFixed(1)}</span>
                {chrome.ratingLabel}
                {content.reviewCount ? ` · ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : ""}
              </p>
            )}
          </Wrap>
        </section>

        <section className={`scroll-mt-24 border-t ${LINE} bg-[#0b1417] py-20 md:py-28`} id="treatments" data-section="services">
          <Wrap>
            <div className="text-center" data-reveal>
              <Eyebrow>{chrome.servicesKicker}</Eyebrow>
              <h2 className={`${SERIF} mx-auto mt-6 max-w-3xl text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.05] font-light`}>
                {chrome.servicesTitle} <em className={`${GOLD} italic`}>{chrome.servicesEm}</em>
              </h2>
              {note && <p className={`mx-auto mt-5 max-w-xl text-[15px] leading-relaxed ${SOFT}`}>{note}</p>}
            </div>
            <ol className={`mx-auto mt-14 max-w-4xl border-t ${LINE}`}>
              {content.services.map((service, i) => (
                <li key={service.title} className={`group grid gap-3 border-b ${LINE} py-8 sm:grid-cols-[5rem_1fr] sm:gap-10`} data-reveal style={revealDelay((i % 3) * 90)}>
                  <span className={`${SERIF} text-[26px] leading-none italic ${GOLD}`}>{ROMAN[i] ?? i + 1}</span>
                  <div>
                    <h3 className={`${SERIF} text-[28px] leading-tight font-normal transition-colors group-hover:text-[#c9a96e]`}>{service.title}</h3>
                    <p className={`mt-2 max-w-2xl text-[15.5px] leading-relaxed ${SOFT}`}>{service.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        <section className="scroll-mt-24 py-20 md:py-28" id="experience" data-section="visit">
          <Wrap>
            <div className="text-center" data-reveal>
              <Eyebrow>{chrome.visitKicker}</Eyebrow>
              <h2 className={`${SERIF} mx-auto mt-6 max-w-3xl text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.05] font-light`}>{chrome.visitTitle}</h2>
            </div>
            <ol className={`mt-14 grid gap-px border ${LINE} bg-[#c9a96e]/25 md:grid-cols-3`}>
              {steps.map((step, i) => (
                <li key={step.title} className="bg-[#0f1a1d] px-8 py-10 text-center" data-reveal style={revealDelay(i * 120)}>
                  <p className={`${SERIF} text-[40px] leading-none italic ${GOLD}`}>{ROMAN[i]}</p>
                  <h3 className={`${SERIF} mt-5 text-[26px] font-normal`}>{step.title}</h3>
                  <p className={`mt-3 text-[15px] leading-relaxed ${SOFT}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className={`scroll-mt-24 border-t ${LINE} bg-[#0b1417] py-20 md:py-28`} id="enquiries" data-section="faq">
            <Wrap className="max-w-[56rem]">
              <div className="text-center" data-reveal>
                <Eyebrow>Enquiries</Eyebrow>
                <h2 className={`${SERIF} mt-6 text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.05] font-light`}>
                  Asked <em className={`${GOLD} italic`}>often.</em>
                </h2>
              </div>
              <div className={`mt-12 border-t ${LINE}`} data-reveal style={revealDelay(100)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${LINE}`} open={i === 0}>
                    <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[23px] font-normal`}>
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[22px] transition-transform group-open:rotate-45 ${GOLD}`}>
                        +
                      </span>
                    </summary>
                    <p className={`max-w-2xl pb-7 text-[15.5px] leading-relaxed ${SOFT}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-24 py-20 md:py-28" id="appointments" data-section="contact">
          <Wrap>
            <div className={`grid border ${LINE} lg:grid-cols-2`}>
              <div className="px-7 py-12 sm:px-12" data-reveal>
                <p className={`text-[11px] font-medium tracking-[0.42em] uppercase ${GOLD}`}>Appointments</p>
                <h2 className={`${SERIF} mt-6 text-[clamp(2.1rem,4.2vw,3.3rem)] leading-[1.05] font-light`}>
                  {chrome.closingTitle} <em className={`${GOLD} italic`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-10 grid gap-6 text-[15.5px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[11px] tracking-[0.3em] uppercase ${GOLD}`}>Address</dt>
                      <dd className={`mt-2 leading-relaxed ${SOFT}`}>{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[11px] tracking-[0.3em] uppercase ${GOLD}`}>Telephone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className={`${SERIF} text-[22px] transition-colors hover:text-[#c9a96e]`}>
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[11px] tracking-[0.3em] uppercase ${GOLD}`}>Hours</dt>
                    <dd className={`mt-2 ${SOFT}`}>By appointment — message or call to confirm today&apos;s hours</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <GoldButton key={action.key} href={action.href} outline={i > 0}>
                        {action.label}
                      </GoldButton>
                    ))}
                  </div>
                ) : (
                  <p className={`mt-10 text-[15px] ${SOFT}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <MapEmbed content={content} className={`min-h-80 border-t ${LINE} lg:border-t-0 lg:border-l`} frameClassName="grayscale invert-[.9] hue-rotate-180 contrast-[.9]" />
              ) : (
                <div aria-hidden className={`hidden border-l ${LINE} bg-[radial-gradient(circle_at_50%_50%,rgba(201,169,110,.14),transparent_65%)] lg:block`} />
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${LINE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col items-center gap-3 py-10 text-center text-[13px] ${SOFT}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center text-[24px] tracking-[0.04em] text-[#ece6da]`}>
            {content.businessName}
          </a>
          <p className="max-w-md leading-relaxed">{conceptNotice(content, chrome)}</p>
        </Wrap>
      </footer>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
