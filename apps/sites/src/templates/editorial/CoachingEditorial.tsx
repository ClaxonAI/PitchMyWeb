import "./coaching.css";
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

// "Notebook": the coaching centre as a well-kept exercise book. Ruled paper
// with a red margin, highlighter swipes on the words that matter, classes
// pinned up as sticky notes, the visit steps as a ticked checklist. Warm and
// studious — and no results, toppers or pass rates are ever invented.

const SERIF = "font-[family-name:var(--font-fraunces)]";
const MONO = "font-mono";
const INK = "text-[#1d2b4f]";
const SOFT = "text-[#1d2b4f]/72";
const RED = "text-[#d23c3c]";
const NOTE_COLOURS = ["bg-[#fff3a6]", "bg-[#cdeccf]", "bg-[#ffd6c9]", "bg-[#d4e4ff]"] as const;

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[76rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Mark({ children }: { children: React.ReactNode }) {
  return <mark className="notebook-mark bg-transparent text-inherit">{children}</mark>;
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-transform hover:-translate-y-0.5 ${
        solid ? "bg-[#1d2b4f] text-white shadow-[3px_3px_0_#d23c3c]" : "border-2 border-[#1d2b4f] bg-white text-[#1d2b4f] shadow-[3px_3px_0_#1d2b4f]"
      }`}
    >
      {children}
    </a>
  );
}

export function CoachingEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#timetable");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`coaching-notebook min-h-dvh font-[family-name:var(--font-hanken)] ${INK} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#1d2b4f", color: "rgba(255,255,255,.72)", strong: "#ffffff", accent: "#fff176" }} />

      <header className="sticky top-0 z-40 border-b-2 border-[#1d2b4f] bg-[#fdfcf7]">
        <Wrap>
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className={`${SERIF} min-h-11 min-w-0 truncate pt-2.5 text-[22px] font-semibold`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-7 text-[14px] font-semibold">
                <li>
                  <a href="#classes" className="hover:text-[#d23c3c]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#checklist" className="hover:text-[#d23c3c]">
                    How to join
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#questions" className="hover:text-[#d23c3c]">
                      Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#timetable" className="hover:text-[#d23c3c]">
                    Visit
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[#1d2b4f] px-4 text-[14px] font-semibold text-white shadow-[3px_3px_0_#d23c3c]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Enquire</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="notebook-page py-14 md:py-20" data-section="hero">
          <Wrap>
            <div className="notebook-margin pl-6 sm:pl-16">
              <p className={`${MONO} text-[13px] ${RED}`} data-reveal>
                {content.area ? `${chrome.noun} — ${content.area}` : chrome.noun}
              </p>
              <h1
                className={`${SERIF} mt-5 max-w-4xl ${content.businessName.length > 26 ? "text-[clamp(2.4rem,5.4vw,4.4rem)]" : "text-[clamp(3rem,7.4vw,6.2rem)]"} leading-[1.02] font-semibold tracking-[-0.02em]`}
                data-reveal
                style={revealDelay(80)}
              >
                {content.businessName}
              </h1>
              <p className={`${SERIF} mt-5 text-[clamp(1.4rem,2.6vw,2.1rem)] leading-snug italic`} data-reveal style={revealDelay(130)}>
                <Mark>{content.tagline}</Mark>
              </p>
              <p className={`mt-6 max-w-xl text-[17px] leading-[2rem] ${SOFT}`} data-reveal style={revealDelay(170)}>
                {content.intro}
              </p>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row" data-reveal style={revealDelay(210)}>
                <Button href={cta} solid>
                  {chrome.cta}
                </Button>
                <Button href="#classes">See the {chrome.navServices.toLowerCase()}</Button>
              </div>
              {content.rating !== undefined && (
                <p className={`${MONO} mt-10 inline-block -rotate-2 border-2 border-[#d23c3c] px-3 py-2 text-[13px] ${RED}`} data-reveal style={revealDelay(250)}>
                  {content.rating.toFixed(1)}/5 · {chrome.ratingLabel}
                  {content.reviewCount ? ` · ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : ""}
                </p>
              )}
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-20 border-t-2 border-[#1d2b4f] bg-[#f3efe2] py-16 md:py-24" id="classes" data-section="services">
          <Wrap>
            <div className="max-w-2xl" data-reveal>
              <p className={`${MONO} text-[13px] ${RED}`}>{chrome.servicesKicker}</p>
              <h2 className={`${SERIF} mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.05] font-semibold`}>
                {chrome.servicesTitle} <Mark>{chrome.servicesEm}</Mark>
              </h2>
              {note && <p className={`mt-4 text-[15.5px] leading-relaxed ${SOFT}`}>{note}</p>}
            </div>
            <ul className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {content.services.map((service, i) => (
                <li
                  key={service.title}
                  className={`notebook-note relative p-7 shadow-[0_16px_24px_-18px_rgba(29,43,79,.7)] ${NOTE_COLOURS[i % NOTE_COLOURS.length]}`}
                  style={{ ["--tilt" as string]: `${[-1.6, 1.2, -0.6, 1.8, -1.2, 0.8][i % 6]}deg`, ...revealDelay((i % 3) * 90) }}
                  data-reveal
                >
                  <span aria-hidden className="absolute -top-3 left-1/2 h-6 w-16 -translate-x-1/2 rotate-2 bg-white/60" />
                  <h3 className={`${SERIF} text-[25px] leading-tight font-semibold`}>{service.title}</h3>
                  <p className={`mt-3 text-[15.5px] leading-relaxed ${SOFT}`}>{service.description}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="notebook-page scroll-mt-20 border-t-2 border-[#1d2b4f] py-16 md:py-24" id="checklist" data-section="visit">
          <Wrap>
            <div className="notebook-margin pl-6 sm:pl-16">
              <div data-reveal>
                <p className={`${MONO} text-[13px] ${RED}`}>{chrome.visitKicker}</p>
                <h2 className={`${SERIF} mt-4 max-w-3xl text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.05] font-semibold`}>{chrome.visitTitle}</h2>
              </div>
              <ol className="mt-10 grid gap-6">
                {steps.map((step, i) => (
                  <li key={step.title} className="flex gap-5" data-reveal style={revealDelay(i * 110)}>
                    <span aria-hidden className="notebook-tick mt-1 grid size-8 shrink-0 place-items-center rounded-md border-2 border-[#1d2b4f] bg-white text-[18px] font-bold text-[#d23c3c]">
                      ✓
                    </span>
                    <div>
                      <h3 className={`${SERIF} text-[24px] font-semibold`}>
                        {i + 1}. {step.title}
                      </h3>
                      <p className={`mt-1 max-w-xl text-[16px] leading-[2rem] ${SOFT}`}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-20 border-t-2 border-[#1d2b4f] bg-[#f3efe2] py-16 md:py-24" id="questions" data-section="faq">
            <Wrap className="max-w-[58rem]">
              <h2 className={`${SERIF} text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.05] font-semibold`} data-reveal>
                Questions <Mark>parents ask.</Mark>
              </h2>
              <div className="mt-8 grid gap-4" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className="group rounded-xl border-2 border-[#1d2b4f] bg-white px-6 shadow-[4px_4px_0_#1d2b4f]" open={i === 0}>
                    <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-[20px] font-semibold`}>
                      <span>
                        <span className={`${MONO} mr-2 text-[14px] ${RED}`}>Q.</span>
                        {faq.question}
                      </span>
                      <span aria-hidden className={`shrink-0 text-[24px] transition-transform group-open:rotate-45 ${RED}`}>
                        +
                      </span>
                    </summary>
                    <p className={`pb-6 text-[16px] leading-relaxed ${SOFT}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="notebook-page scroll-mt-20 border-t-2 border-[#1d2b4f] py-16 md:py-24" id="timetable" data-section="contact">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-2">
              <div className="notebook-margin pl-6 sm:pl-16" data-reveal>
                <p className={`${MONO} text-[13px] ${RED}`}>Visit</p>
                <h2 className={`${SERIF} mt-4 text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.05] font-semibold`}>
                  {chrome.closingTitle} <Mark>{chrome.closingEm}</Mark>
                </h2>
                <dl className="mt-8 grid gap-4 text-[16px]">
                  {content.address && (
                    <div>
                      <dt className={`${MONO} text-[12px] ${RED}`}>Address</dt>
                      <dd className="mt-1 leading-[2rem]">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`${MONO} text-[12px] ${RED}`}>Phone</dt>
                      <dd className="mt-1">
                        {links.call ? (
                          <a href={links.call} className="font-semibold underline decoration-[#d23c3c] decoration-2 underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`${MONO} text-[12px] ${RED}`}>Timings</dt>
                    <dd className="mt-1 leading-[2rem]">Message or call to ask about batch timings</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
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
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className="min-h-80 rounded-xl border-2 border-[#1d2b4f] shadow-[6px_6px_0_#1d2b4f] lg:h-full" />
                </div>
              ) : null}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t-2 border-[#1d2b4f] bg-[#fdfcf7] pb-24 lg:pb-0">
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${SOFT}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center self-start text-[20px] font-semibold ${INK}`}>
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
