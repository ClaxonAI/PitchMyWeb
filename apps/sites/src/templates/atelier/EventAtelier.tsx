import "./event.css";
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

// "Gala": the planner's site as a night to remember. Midnight blue, a sky of
// slowly twinkling stars drawn in CSS, champagne gold and Bodoni italics. The
// services are admission tickets with a torn stub, the rating a gold medal.
// Glamorous in feel, strictly factual in content.

const DIDONE = "font-[family-name:var(--font-bodoni)]";
const GOLD = "text-[#e3c07a]";
const DIM = "text-[#e9e6f5]/68";
const LINE = "border-[#e3c07a]/25";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[78rem] px-5 sm:px-10 ${className}`}>{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className={`flex items-center justify-center gap-3 text-[11px] font-medium tracking-[0.38em] uppercase ${GOLD}`}>
      <span aria-hidden>✦</span>
      {children}
      <span aria-hidden>✦</span>
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
          ? "bg-[linear-gradient(135deg,#f4dea4,#c99a45)] text-[#0d1330] shadow-[0_0_30px_-8px_rgba(227,192,122,.8)] hover:brightness-110"
          : "border border-[#e3c07a]/50 text-[#e9e6f5] hover:border-[#e3c07a] hover:text-[#e3c07a]"
      }`}
    >
      {children}
    </a>
  );
}

export function EventAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#reserve-the-date");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className="event-gala min-h-dvh bg-[#0d1330] font-[family-name:var(--font-hanken)] text-[#e9e6f5] antialiased [overflow-wrap:break-word]" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#080c20", color: "rgba(233,230,245,.62)", strong: "#e9e6f5", accent: "#e3c07a" }} />

      <header className={`sticky top-0 z-40 border-b ${LINE} bg-[#0d1330]/88 backdrop-blur-md`}>
        <Wrap>
          <div className="flex h-[72px] items-center justify-between gap-4">
            <a href="#top" className={`${DIDONE} min-h-11 min-w-0 truncate pt-2.5 text-[22px] italic`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-9 text-[11px] font-medium tracking-[0.3em] uppercase">
                <li>
                  <a href="#occasions" className="hover:text-[#e3c07a]">
                    Occasions
                  </a>
                </li>
                <li>
                  <a href="#the-plan" className="hover:text-[#e3c07a]">
                    The plan
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#questions" className="hover:text-[#e3c07a]">
                      Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#reserve-the-date" className="hover:text-[#e3c07a]">
                    Reserve the date
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[#e3c07a]/60 px-5 text-[11px] font-medium tracking-[0.22em] uppercase transition-colors hover:bg-[#e3c07a] hover:text-[#0d1330]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Enquire</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="gala-sky relative overflow-hidden py-24 text-center md:py-36" data-section="hero">
          <div aria-hidden className="gala-stars absolute inset-0" />
          <div aria-hidden className="gala-stars gala-stars-slow absolute inset-0" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_100%,rgba(227,192,122,.18),transparent_70%)]" />
          <Wrap className="relative">
            <div data-reveal>
              <Kicker>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Kicker>
            </div>
            <h1
              className={`${DIDONE} mx-auto mt-8 max-w-5xl ${content.businessName.length > 26 ? "text-[clamp(2.6rem,6vw,5rem)]" : "text-[clamp(3.4rem,9vw,8rem)]"} leading-[0.95] italic`}
              data-reveal
              style={revealDelay(100)}
            >
              {content.businessName}
            </h1>
            <p className={`mx-auto mt-7 max-w-2xl text-[clamp(1.1rem,2vw,1.4rem)] leading-snug tracking-[0.04em] ${GOLD}`} data-reveal style={revealDelay(160)}>
              {content.tagline}
            </p>
            <p className={`mx-auto mt-5 max-w-xl text-[16px] leading-relaxed ${DIM}`} data-reveal style={revealDelay(200)}>
              {content.intro}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row" data-reveal style={revealDelay(240)}>
              <Button href={cta} solid>
                {chrome.cta}
              </Button>
              <Button href="#occasions">The occasions</Button>
            </div>
          </Wrap>
        </section>

        <section className={`scroll-mt-24 border-t ${LINE} py-16 md:py-24`} id="occasions" data-section="services">
          <Wrap>
            <div className="text-center" data-reveal>
              <Kicker>{chrome.servicesKicker}</Kicker>
              <h2 className={`${DIDONE} mx-auto mt-6 max-w-3xl text-[clamp(2.3rem,4.8vw,4rem)] leading-[1.02]`}>
                {chrome.servicesTitle} <em className={`italic ${GOLD}`}>{chrome.servicesEm}</em>
              </h2>
              {note && <p className={`mx-auto mt-5 max-w-xl text-[15px] leading-relaxed ${DIM}`}>{note}</p>}
            </div>
            <ul className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
              {content.services.map((service, i) => (
                <li key={service.title} className="gala-ticket grid grid-cols-[1fr_5.5rem] overflow-hidden rounded-2xl" data-reveal style={revealDelay((i % 2) * 90)}>
                  <div className="p-7">
                    <p className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${GOLD}`}>Admit · {pad(i)}</p>
                    <h3 className={`${DIDONE} mt-3 text-[27px] leading-tight italic`}>{service.title}</h3>
                    <p className={`mt-2 text-[15px] leading-relaxed ${DIM}`}>{service.description}</p>
                  </div>
                  <div aria-hidden className="gala-stub grid place-items-center">
                    <span className={`${DIDONE} text-[34px] italic ${GOLD}`}>{i + 1}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-24 bg-[#111a3d] py-16 md:py-24" id="the-plan" data-section="visit">
          <Wrap>
            <div className="text-center" data-reveal>
              <Kicker>{chrome.visitKicker}</Kicker>
              <h2 className={`${DIDONE} mx-auto mt-6 max-w-3xl text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.02] italic`}>{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="text-center" data-reveal style={revealDelay(i * 120)}>
                  <span className={`mx-auto grid size-16 place-items-center rounded-full border ${LINE} ${DIDONE} text-[26px] italic ${GOLD}`}>{i + 1}</span>
                  <h3 className={`${DIDONE} mt-5 text-[26px] italic`}>{step.title}</h3>
                  <p className={`mx-auto mt-2 max-w-xs text-[15px] leading-relaxed ${DIM}`}>{step.body}</p>
                </li>
              ))}
            </ol>
            {content.rating !== undefined && (
              <div className="mt-16 flex flex-col items-center gap-3 text-center" data-reveal>
                <span className="gala-medal grid size-28 place-items-center rounded-full">
                  <span className={`${DIDONE} text-[40px] text-[#0d1330] italic`}>{content.rating.toFixed(1)}</span>
                </span>
                <p className={`text-[12px] tracking-[0.26em] uppercase ${DIM}`}>
                  {chrome.ratingLabel}
                  {content.reviewCount ? ` · ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : ""}
                </p>
              </div>
            )}
          </Wrap>
        </section>

        {hasFaq && (
          <section className={`scroll-mt-24 border-t ${LINE} py-16 md:py-24`} id="questions" data-section="faq">
            <Wrap className="max-w-[54rem]">
              <div data-reveal>
                <Kicker>Questions</Kicker>
              </div>
              <div className={`mt-8 border-t ${LINE}`} data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${LINE}`} open={i === 0}>
                    <summary className={`${DIDONE} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[23px] italic`}>
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[20px] not-italic transition-transform group-open:rotate-45 ${GOLD}`}>
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

        <section className="scroll-mt-24 py-16 md:py-24" id="reserve-the-date" data-section="contact">
          <Wrap>
            <div className={`grid overflow-hidden rounded-[2rem] border ${LINE} bg-[#111a3d] lg:grid-cols-2`}>
              <div className="p-8 sm:p-12" data-reveal>
                <p className={`text-[11px] font-medium tracking-[0.38em] uppercase ${GOLD}`}>Reserve the date</p>
                <h2 className={`${DIDONE} mt-6 text-[clamp(2.2rem,4.4vw,3.5rem)] leading-[1.02]`}>
                  {chrome.closingTitle} <em className={`italic ${GOLD}`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-10 grid gap-6 text-[15.5px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${GOLD}`}>Address</dt>
                      <dd className={`mt-2 leading-relaxed ${DIM}`}>{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${GOLD}`}>Telephone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className={`${DIDONE} text-[23px] italic hover:text-[#e3c07a]`}>
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${GOLD}`}>To begin</dt>
                    <dd className={`mt-2 ${DIM}`}>Share the date, guest count and the kind of event</dd>
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
                <MapEmbed content={content} className="min-h-80" frameClassName="grayscale invert-[.9] hue-rotate-[190deg] sepia-[.2]" />
              ) : (
                <div aria-hidden className="gala-stars hidden lg:block" />
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${LINE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col items-center gap-3 py-10 text-center text-[13px] ${DIM}`}>
          <a href="#top" className={`${DIDONE} inline-flex min-h-11 items-center text-[24px] text-[#e9e6f5] italic`}>
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
