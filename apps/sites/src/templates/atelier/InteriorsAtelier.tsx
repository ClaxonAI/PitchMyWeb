import "./interiors.css";
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

// "Material Library": the studio as a room of samples. Deep olive walls,
// brass and linen; a fan of material swatches in the hero (marble, oak,
// brass, linen, terrazzo) drawn entirely in CSS; each service carries its own
// swatch chip. Tactile and expensive-feeling without a single stock photo,
// and no project, client or price is invented.

const SERIF = "font-[family-name:var(--font-cormorant)]";
const BRASS = "text-[#d0b37a]";
const LINEN = "text-[#efe9dd]";
const DIM = "text-[#efe9dd]/65";
const LINE = "border-[#d0b37a]/25";
const SWATCHES = ["swatch-marble", "swatch-oak", "swatch-brass", "swatch-linen", "swatch-terrazzo", "swatch-walnut"] as const;

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[80rem] px-5 sm:px-10 ${className}`}>{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className={`text-[11px] font-medium tracking-[0.36em] uppercase ${BRASS}`}>{children}</p>;
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center px-8 text-[12px] font-medium tracking-[0.26em] uppercase transition-colors ${
        solid ? "swatch-brass text-[#26291f] hover:brightness-110" : "border border-[#d0b37a]/50 text-[#efe9dd] hover:border-[#d0b37a] hover:text-[#d0b37a]"
      }`}
    >
      {children}
    </a>
  );
}

export function InteriorsAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#appointment");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`interiors-library min-h-dvh bg-[#26291f] font-[family-name:var(--font-hanken)] ${LINEN} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#1b1d16", color: "rgba(239,233,221,.62)", strong: "#efe9dd", accent: "#d0b37a" }} />

      <header className={`sticky top-0 z-40 border-b ${LINE} bg-[#26291f]/92 backdrop-blur-md`}>
        <Wrap>
          <div className="flex h-[72px] items-center justify-between gap-4">
            <a href="#top" className={`${SERIF} min-h-11 min-w-0 truncate pt-2 text-[26px] font-medium`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-9 text-[11px] font-medium tracking-[0.3em] uppercase">
                <li>
                  <a href="#library" className="hover:text-[#d0b37a]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#consultation" className="hover:text-[#d0b37a]">
                    Consultation
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#questions" className="hover:text-[#d0b37a]">
                      Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#appointment" className="hover:text-[#d0b37a]">
                    {chrome.navVisit}
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center border border-[#d0b37a]/60 px-5 text-[11px] font-medium tracking-[0.22em] uppercase transition-colors hover:bg-[#d0b37a] hover:text-[#26291f]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Enquire</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="overflow-hidden py-16 md:py-24" data-section="hero">
          <Wrap>
            <div className="grid items-center gap-14 lg:grid-cols-[1fr_1fr]">
              <div data-reveal>
                <Kicker>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Kicker>
                <h1 className={`${SERIF} mt-7 ${content.businessName.length > 26 ? "text-[clamp(2.6rem,5.6vw,4.8rem)]" : "text-[clamp(3.2rem,8vw,7rem)]"} leading-[0.92] font-light`}>
                  {content.businessName}
                </h1>
                <p className={`${SERIF} mt-6 text-[clamp(1.4rem,2.4vw,2rem)] leading-snug italic ${BRASS}`}>{content.tagline}</p>
                <p className={`mt-6 max-w-lg text-[16px] leading-relaxed ${DIM}`}>{content.intro}</p>
                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta} solid>
                    {chrome.cta}
                  </Button>
                  <Button href="#library">The library</Button>
                </div>
              </div>
              <div aria-hidden className="relative mx-auto h-[22rem] w-full max-w-[26rem] sm:h-[26rem]" data-reveal style={revealDelay(150)}>
                {SWATCHES.slice(0, 5).map((swatch, i) => (
                  <div
                    key={swatch}
                    className={`library-card absolute top-1/2 left-1/2 h-[70%] w-[46%] rounded-sm shadow-[0_30px_60px_-25px_rgba(0,0,0,.7)] ${swatch}`}
                    style={{ ["--fan" as string]: `${(i - 2) * 11}deg`, ["--shift" as string]: `${(i - 2) * 16}%`, zIndex: i }}
                  />
                ))}
              </div>
            </div>
          </Wrap>
        </section>

        <section className={`scroll-mt-24 border-t ${LINE} bg-[#2d3025] py-16 md:py-24`} id="library" data-section="services">
          <Wrap>
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end" data-reveal>
              <div>
                <Kicker>{chrome.servicesKicker}</Kicker>
                <h2 className={`${SERIF} mt-6 text-[clamp(2.4rem,5vw,4.2rem)] leading-[1] font-light`}>
                  {chrome.servicesTitle} <em className={`italic ${BRASS}`}>{chrome.servicesEm}</em>
                </h2>
              </div>
              {note && <p className={`max-w-md text-[15px] leading-relaxed lg:justify-self-end ${DIM}`}>{note}</p>}
            </div>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {content.services.map((service, i) => (
                <li key={service.title} className={`border ${LINE} bg-[#26291f] p-6`} data-reveal style={revealDelay((i % 3) * 90)}>
                  <div aria-hidden className={`h-24 rounded-sm ${SWATCHES[i % SWATCHES.length]}`} />
                  <h3 className={`${SERIF} mt-6 text-[28px] leading-tight font-normal`}>{service.title}</h3>
                  <p className={`mt-2 text-[15px] leading-relaxed ${DIM}`}>{service.description}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-24 py-16 md:py-24" id="consultation" data-section="visit">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
              <div data-reveal>
                <Kicker>{chrome.visitKicker}</Kicker>
                <h2 className={`${SERIF} mt-6 text-[clamp(2.3rem,4.6vw,3.8rem)] leading-[1] font-light`}>{chrome.visitTitle}</h2>
                {content.rating !== undefined && (
                  <p className={`mt-10 text-[12px] tracking-[0.26em] uppercase ${DIM}`}>
                    <span className={`${SERIF} mr-3 text-[40px] tracking-normal ${BRASS}`}>{content.rating.toFixed(1)}</span>
                    {chrome.ratingLabel}
                    {content.reviewCount ? ` · ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : ""}
                  </p>
                )}
              </div>
              <ol className={`border-t ${LINE}`}>
                {steps.map((step, i) => (
                  <li key={step.title} className={`grid grid-cols-[4rem_1fr] gap-4 border-b ${LINE} py-7`} data-reveal style={revealDelay(i * 110)}>
                    <span className={`${SERIF} text-[42px] leading-none font-light italic ${BRASS}`}>{i + 1}</span>
                    <div>
                      <h3 className={`${SERIF} text-[28px]`}>{step.title}</h3>
                      <p className={`mt-2 text-[15px] leading-relaxed ${DIM}`}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {hasFaq && (
          <section className={`scroll-mt-24 border-t ${LINE} bg-[#2d3025] py-16 md:py-24`} id="questions" data-section="faq">
            <Wrap className="max-w-[56rem]">
              <div data-reveal>
                <Kicker>Questions</Kicker>
              </div>
              <div className={`mt-8 border-t ${LINE}`} data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${LINE}`} open={i === 0}>
                    <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[25px] font-normal`}>
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[22px] transition-transform group-open:rotate-45 ${BRASS}`}>
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

        <section className="scroll-mt-24 py-16 md:py-24" id="appointment" data-section="contact">
          <Wrap>
            <div className={`grid border ${LINE} lg:grid-cols-2`}>
              <div className="p-8 sm:p-12" data-reveal>
                <Kicker>{chrome.navVisit}</Kicker>
                <h2 className={`${SERIF} mt-6 text-[clamp(2.2rem,4.4vw,3.5rem)] leading-[1] font-light`}>
                  {chrome.closingTitle} <em className={`italic ${BRASS}`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-10 grid gap-6 text-[15.5px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${BRASS}`}>Studio</dt>
                      <dd className={`mt-2 leading-relaxed ${DIM}`}>{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${BRASS}`}>Telephone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className={`${SERIF} text-[25px] hover:text-[#d0b37a]`}>
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[10.5px] font-medium tracking-[0.3em] uppercase ${BRASS}`}>Hours</dt>
                    <dd className={`mt-2 ${DIM}`}>By appointment — message or call to arrange a visit</dd>
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
                <MapEmbed content={content} className={`min-h-80 border-t ${LINE} lg:border-t-0 lg:border-l`} frameClassName="grayscale sepia-[.4] contrast-[.95] brightness-[.9]" />
              ) : (
                <div aria-hidden className="swatch-marble hidden lg:block" />
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${LINE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${DIM}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center self-start text-[24px] ${LINEN}`}>
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
