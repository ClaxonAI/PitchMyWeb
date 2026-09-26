import "./coaching.css";
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

// "Crest": the coaching centre with the gravity of an old college. Oxford
// navy and parchment, gold leaf, Instrument Serif; a shield crest built from
// the centre's own initials above an open book. Classes read as a course
// catalogue, joining as admissions. Serious and trustworthy, with no
// founding year, rankings or results invented.

const SERIF = "font-[family-name:var(--font-instrument)]";
const NAVY = "text-[#14213d]";
const SOFT = "text-[#14213d]/72";
const GOLD = "text-[#9a7a3a]";
const LINE = "border-[#14213d]/15";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[76rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? name).slice(0, 1)).toUpperCase();
}

/** The college crest: a shield with the initials, a chevron and an open book. Decorative. */
function Crest({ letters, className = "" }: { letters: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 240" className={className}>
      <path d="M100 12 L178 38 V118 C178 170 142 206 100 226 C58 206 22 170 22 118 V38 Z" fill="#14213d" stroke="#c9a85e" strokeWidth="4" />
      <path d="M100 26 L166 48 V118 C166 162 136 193 100 211 C64 193 34 162 34 118 V48 Z" fill="none" stroke="#c9a85e" strokeOpacity=".5" strokeWidth="1.5" />
      <path d="M38 142 L100 112 L162 142" fill="none" stroke="#c9a85e" strokeWidth="6" />
      <text x="100" y="96" textAnchor="middle" fontFamily="var(--font-instrument), Georgia, serif" fontSize="52" fill="#f4efe3">
        {letters}
      </text>
      <path d="M66 166 q17 -9 34 0 q17 -9 34 0 v22 q-17 -9 -34 0 q-17 -9 -34 0 z" fill="none" stroke="#c9a85e" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M100 166 v22" stroke="#c9a85e" strokeWidth="2" />
    </svg>
  );
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center px-7 text-[12px] font-semibold tracking-[0.2em] uppercase transition-colors ${
        solid ? "bg-[#14213d] text-[#f4efe3] hover:bg-[#9a7a3a]" : "border border-[#14213d]/40 text-[#14213d] hover:border-[#9a7a3a] hover:text-[#9a7a3a]"
      }`}
    >
      {children}
    </a>
  );
}

export function CoachingAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#admissions-office");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;
  const letters = initials(content.businessName);

  return (
    <div className={`coaching-crest min-h-dvh bg-[#f4efe3] font-[family-name:var(--font-hanken)] ${NAVY} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#0d1629", color: "rgba(244,239,227,.7)", strong: "#f4efe3", accent: "#c9a85e" }} />

      <header className="sticky top-0 z-40 bg-[#14213d] text-[#f4efe3]">
        <Wrap>
          <div className="flex h-[70px] items-center justify-between gap-4">
            <a href="#top" className="flex min-h-11 min-w-0 items-center gap-3">
              <Crest letters={letters} className="h-10 w-auto shrink-0" />
              <span className={`${SERIF} truncate text-[22px]`}>{content.businessName}</span>
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-8 text-[11px] font-semibold tracking-[0.24em] uppercase">
                <li>
                  <a href="#catalogue" className="text-[#f4efe3]/80 hover:text-[#c9a85e]">
                    Courses
                  </a>
                </li>
                <li>
                  <a href="#admissions" className="text-[#f4efe3]/80 hover:text-[#c9a85e]">
                    Admissions
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#prospectus" className="text-[#f4efe3]/80 hover:text-[#c9a85e]">
                      Prospectus
                    </a>
                  </li>
                )}
                <li>
                  <a href="#admissions-office" className="text-[#f4efe3]/80 hover:text-[#c9a85e]">
                    Contact
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center border border-[#c9a85e] px-4 text-[11px] font-semibold tracking-[0.18em] text-[#f4efe3] uppercase transition-colors hover:bg-[#c9a85e] hover:text-[#14213d]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Enquire</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="crest-hero py-16 text-center md:py-24" data-section="hero">
          <Wrap>
            <div data-reveal>
              <Crest letters={letters} className="crest-shine mx-auto h-44 w-auto md:h-52" />
            </div>
            <p className={`mt-8 text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`} data-reveal style={revealDelay(80)}>
              {content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}
            </p>
            <h1
              className={`${SERIF} mx-auto mt-5 max-w-4xl ${content.businessName.length > 26 ? "text-[clamp(2.4rem,5.4vw,4.4rem)]" : "text-[clamp(3rem,7.6vw,6.4rem)]"} leading-[0.98]`}
              data-reveal
              style={revealDelay(120)}
            >
              {content.businessName}
            </h1>
            <p className={`${SERIF} mx-auto mt-5 max-w-2xl text-[clamp(1.35rem,2.4vw,1.9rem)] italic ${GOLD}`} data-reveal style={revealDelay(160)}>
              {content.tagline}
            </p>
            <p className={`mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed ${SOFT}`} data-reveal style={revealDelay(200)}>
              {content.intro}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" data-reveal style={revealDelay(240)}>
              <Button href={cta} solid>
                {chrome.cta}
              </Button>
              <Button href="#catalogue">Course catalogue</Button>
            </div>
          </Wrap>
        </section>

        {content.rating !== undefined && (
          <section className="bg-[#14213d] py-7 text-[#f4efe3]" aria-label={chrome.ratingLabel} data-section="standing">
            <Wrap>
              <p className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-center text-[12px] tracking-[0.24em] uppercase" data-reveal>
                <span className={`${SERIF} text-[34px] tracking-normal text-[#c9a85e]`}>{content.rating.toFixed(1)}</span>
                <span className="text-[#f4efe3]/75">{chrome.ratingLabel}</span>
                {content.reviewCount ? <span className="text-[#f4efe3]/75">{formatCount(content.reviewCount)} {chrome.reviewsLabel}</span> : null}
              </p>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-24 py-16 md:py-24" id="catalogue" data-section="services">
          <Wrap>
            <div className="text-center" data-reveal>
              <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>Course catalogue</p>
              <h2 className={`${SERIF} mx-auto mt-5 max-w-3xl text-[clamp(2.3rem,4.8vw,3.8rem)] leading-[1.02]`}>
                {chrome.servicesTitle} <em className={`italic ${GOLD}`}>{chrome.servicesEm}</em>
              </h2>
              {note && <p className={`mx-auto mt-4 max-w-xl text-[15px] leading-relaxed ${SOFT}`}>{note}</p>}
            </div>
            <ol className={`mx-auto mt-12 grid max-w-5xl border-t-2 border-[#14213d] md:grid-cols-2`}>
              {content.services.map((service, i) => (
                <li key={service.title} className={`grid grid-cols-[4.5rem_1fr] gap-4 border-b ${LINE} py-7 md:odd:pr-8 md:even:border-l md:even:pl-8`} data-reveal style={revealDelay((i % 2) * 90)}>
                  <span className={`pt-1.5 text-[12px] font-semibold tracking-[0.16em] ${GOLD}`}>C–{pad(i)}</span>
                  <div>
                    <h3 className={`${SERIF} text-[26px] leading-tight`}>{service.title}</h3>
                    <p className={`mt-2 text-[15px] leading-relaxed ${SOFT}`}>{service.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        <section className="scroll-mt-24 bg-[#14213d] py-16 text-[#f4efe3] md:py-24" id="admissions" data-section="visit">
          <Wrap>
            <div className="text-center" data-reveal>
              <p className="text-[11px] font-semibold tracking-[0.34em] text-[#c9a85e] uppercase">Admissions</p>
              <h2 className={`${SERIF} mx-auto mt-5 max-w-3xl text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.04]`}>{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="border border-[#c9a85e]/30 p-8 text-center" data-reveal style={revealDelay(i * 110)}>
                  <p className={`${SERIF} text-[44px] leading-none text-[#c9a85e] italic`}>{["I", "II", "III"][i]}</p>
                  <h3 className={`${SERIF} mt-4 text-[26px]`}>{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#f4efe3]/72">{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-24 py-16 md:py-24" id="prospectus" data-section="faq">
            <Wrap className="max-w-[56rem]">
              <div className="text-center" data-reveal>
                <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>From the prospectus</p>
              </div>
              <div className="mt-8 border-t-2 border-[#14213d]" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${LINE}`} open={i === 0}>
                    <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[23px]`}>
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

        <section className="scroll-mt-24 pb-16 md:pb-24" id="admissions-office" data-section="contact">
          <Wrap>
            <div className="grid border-2 border-[#14213d] bg-[#faf7ef] lg:grid-cols-2">
              <div className="p-8 sm:p-12" data-reveal>
                <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>Admissions office</p>
                <h2 className={`${SERIF} mt-5 text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.02]`}>
                  {chrome.closingTitle} <em className={`italic ${GOLD}`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-8 grid gap-5 text-[15.5px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${GOLD}`}>Address</dt>
                      <dd className="mt-1 leading-relaxed">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${GOLD}`}>Telephone</dt>
                      <dd className="mt-1">
                        {links.call ? (
                          <a href={links.call} className="underline decoration-[#9a7a3a]/60 underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${GOLD}`}>Batch timings</dt>
                    <dd className={`mt-1 ${SOFT}`}>Message or call to ask which batches are open</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <Button key={action.key} href={action.href} solid={i === 0}>
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className={`mt-8 text-[15px] ${SOFT}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <MapEmbed content={content} className="min-h-80 border-t-2 border-[#14213d] lg:border-t-0 lg:border-l-2" frameClassName="grayscale sepia-[.25] contrast-[1.05]" />
              ) : (
                <div aria-hidden className="hidden place-items-center bg-[#14213d] lg:grid">
                  <Crest letters={letters} className="h-40 w-auto opacity-90" />
                </div>
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="bg-[#14213d] pb-24 text-[#f4efe3]/70 lg:pb-0">
        <Wrap className="flex flex-col items-center gap-3 py-10 text-center text-[13px]">
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center text-[24px] text-[#f4efe3]`}>
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
