import "./salon.css";
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

// "Maison": the salon as a private beauty house. Deep plum, rose gold and
// soft pearl; Italiana for display with Hanken for text; the oval mirror is
// the motif — the hero's gradient mirror, the service medallions, the seal
// around the rating. Luxurious, quiet, and only built from real facts.

const DISPLAY = "font-[family-name:var(--font-italiana)]";
const ROSE = "text-[#e0ae98]";
const PEARL = "text-[#f5ece6]";
const DIM = "text-[#f5ece6]/68";
const LINE = "border-[#e0ae98]/25";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[78rem] px-5 sm:px-10 ${className}`}>{children}</div>;
}

function Kicker({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <p className={`flex items-center gap-3 text-[11px] font-medium tracking-[0.38em] uppercase ${ROSE} ${center ? "justify-center" : ""}`}>
      <span aria-hidden className="text-[9px]">◆</span>
      {children}
      <span aria-hidden className="text-[9px]">◆</span>
    </p>
  );
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-8 text-[12px] font-medium tracking-[0.26em] uppercase transition-all ${
        solid
          ? "bg-[linear-gradient(135deg,#f0c7b3,#c98d74)] text-[#2b1a2e] shadow-[0_12px_30px_-14px_rgba(224,174,152,.8)] hover:brightness-110"
          : "border border-[#e0ae98]/45 text-[#f5ece6] hover:border-[#e0ae98] hover:text-[#e0ae98]"
      }`}
    >
      {children}
    </a>
  );
}

export function SalonAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#the-house");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`salon-maison min-h-dvh bg-[#2b1a2e] font-[family-name:var(--font-hanken)] ${PEARL} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#1e1220", color: "rgba(245,236,230,.62)", strong: "#f5ece6", accent: "#e0ae98" }} />

      <header className={`sticky top-0 z-40 border-b ${LINE} bg-[#2b1a2e]/90 backdrop-blur-md`}>
        <Wrap>
          <div className="flex h-[72px] items-center justify-between gap-4">
            <a href="#top" className={`${DISPLAY} min-h-11 min-w-0 truncate pt-2.5 text-[26px] tracking-[0.06em]`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-9 text-[11px] font-medium tracking-[0.3em] uppercase">
                <li>
                  <a href="#rituals" className="hover:text-[#e0ae98]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#visit" className="hover:text-[#e0ae98]">
                    {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#questions" className="hover:text-[#e0ae98]">
                      Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#the-house" className="hover:text-[#e0ae98]">
                    The house
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[#e0ae98]/60 px-5 text-[11px] font-medium tracking-[0.22em] uppercase transition-colors hover:bg-[#e0ae98] hover:text-[#2b1a2e]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="relative overflow-hidden py-16 md:py-24" data-section="hero">
          <Wrap>
            <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_.9fr]">
              <div className="order-2 lg:order-1" data-reveal>
                <Kicker>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Kicker>
                <h1 className={`${DISPLAY} mt-8 text-[clamp(3.2rem,8.6vw,7.4rem)] leading-[0.95] tracking-[0.01em]`}>{content.businessName}</h1>
                <p className={`${DISPLAY} mt-6 text-[clamp(1.4rem,2.6vw,2.1rem)] leading-snug ${ROSE}`}>{content.tagline}</p>
                <p className={`mt-6 max-w-lg text-[16.5px] leading-relaxed ${DIM}`}>{content.intro}</p>
                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta} solid>
                    {chrome.cta}
                  </Button>
                  <Button href="#rituals">The services</Button>
                </div>
              </div>
              <div aria-hidden className="order-1 mx-auto w-full max-w-[22rem] lg:order-2 lg:max-w-[26rem]" data-reveal style={revealDelay(140)}>
                <div className="maison-mirror relative aspect-[3/4] rounded-[50%] p-3">
                  <div className="maison-glass size-full rounded-[50%]" />
                  <span className="maison-shine absolute top-[12%] left-[26%] h-[30%] w-[10%] -rotate-[24deg] rounded-full bg-white/25 blur-[2px]" />
                </div>
              </div>
            </div>
          </Wrap>
        </section>

        <section className={`scroll-mt-24 border-t ${LINE} bg-[#241526] py-16 md:py-24`} id="rituals" data-section="services">
          <Wrap>
            <div className="mx-auto max-w-2xl text-center" data-reveal>
              <Kicker center>{chrome.servicesKicker}</Kicker>
              <h2 className={`${DISPLAY} mt-6 text-[clamp(2.3rem,4.8vw,3.9rem)] leading-[1.02]`}>
                {chrome.servicesTitle} <span className={ROSE}>{chrome.servicesEm}</span>
              </h2>
              {note && <p className={`mt-5 text-[15px] leading-relaxed ${DIM}`}>{note}</p>}
            </div>
            <ul className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {content.services.map((service, i) => (
                <li key={service.title} className="text-center" data-reveal style={revealDelay((i % 3) * 90)}>
                  <span aria-hidden className={`mx-auto grid h-20 w-16 place-items-center rounded-[50%] border ${LINE} ${DISPLAY} text-[26px] ${ROSE}`}>
                    {i + 1}
                  </span>
                  <h3 className={`${DISPLAY} mt-5 text-[27px] leading-tight`}>{service.title}</h3>
                  <p className={`mx-auto mt-3 max-w-xs text-[15px] leading-relaxed ${DIM}`}>{service.description}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-24 py-16 md:py-24" id="visit" data-section="visit">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <div data-reveal>
                <Kicker>{chrome.visitKicker}</Kicker>
                <h2 className={`${DISPLAY} mt-6 text-[clamp(2.3rem,4.8vw,3.9rem)] leading-[1.02]`}>{chrome.visitTitle}</h2>
                {content.rating !== undefined && (
                  <div className="mt-10 flex items-center gap-5">
                    <span className={`grid size-24 shrink-0 place-items-center rounded-full border ${LINE} ${DISPLAY} text-[34px] ${ROSE}`}>{content.rating.toFixed(1)}</span>
                    <p className={`text-[13px] leading-relaxed tracking-[0.12em] uppercase ${DIM}`}>
                      {chrome.ratingLabel}
                      {content.reviewCount ? (
                        <>
                          <br />
                          {formatCount(content.reviewCount)} {chrome.reviewsLabel}
                        </>
                      ) : null}
                    </p>
                  </div>
                )}
              </div>
              <ol className="grid gap-4">
                {steps.map((step, i) => (
                  <li key={step.title} className={`flex gap-6 rounded-[2rem] border ${LINE} bg-[#321f35] p-7`} data-reveal style={revealDelay(i * 110)}>
                    <span className={`${DISPLAY} text-[40px] leading-none ${ROSE}`}>{i + 1}</span>
                    <div>
                      <h3 className={`${DISPLAY} text-[25px]`}>{step.title}</h3>
                      <p className={`mt-2 text-[15px] leading-relaxed ${DIM}`}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {hasFaq && (
          <section className={`scroll-mt-24 border-t ${LINE} bg-[#241526] py-16 md:py-24`} id="questions" data-section="faq">
            <Wrap className="max-w-[54rem]">
              <div className="text-center" data-reveal>
                <Kicker center>Questions</Kicker>
              </div>
              <div className={`mt-10 border-t ${LINE}`} data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${LINE}`} open={i === 0}>
                    <summary className={`${DISPLAY} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[24px]`}>
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[22px] transition-transform group-open:rotate-45 ${ROSE}`}>
                        +
                      </span>
                    </summary>
                    <p className={`max-w-2xl pb-7 text-[15.5px] leading-relaxed ${DIM}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-24 py-16 md:py-24" id="the-house" data-section="contact">
          <Wrap>
            <div className={`grid overflow-hidden rounded-[2.5rem] border ${LINE} bg-[#321f35] lg:grid-cols-2`}>
              <div className="p-8 sm:p-12" data-reveal>
                <Kicker>The house</Kicker>
                <h2 className={`${DISPLAY} mt-6 text-[clamp(2.2rem,4.4vw,3.5rem)] leading-[1.02]`}>
                  {chrome.closingTitle} <span className={ROSE}>{chrome.closingEm}</span>
                </h2>
                <dl className="mt-10 grid gap-6 text-[15.5px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${ROSE}`}>Address</dt>
                      <dd className={`mt-2 leading-relaxed ${DIM}`}>{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${ROSE}`}>Telephone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className={`${DISPLAY} text-[24px] hover:text-[#e0ae98]`}>
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${ROSE}`}>Hours</dt>
                    <dd className={`mt-2 ${DIM}`}>By appointment — message or call to confirm today&apos;s hours</dd>
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
                  <p className={`mt-10 text-[15px] ${DIM}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <MapEmbed content={content} className="min-h-80" frameClassName="grayscale invert-[.88] hue-rotate-[200deg] sepia-[.35]" />
              ) : (
                <div aria-hidden className="maison-glass hidden lg:block" />
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${LINE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col items-center gap-3 py-10 text-center text-[13px] ${DIM}`}>
          <a href="#top" className={`${DISPLAY} inline-flex min-h-11 items-center text-[26px] tracking-[0.06em] ${PEARL}`}>
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
