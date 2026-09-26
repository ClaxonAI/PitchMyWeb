import "./interiors.css";
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

// "Folio": the studio as an architect's portfolio sheet. Greige drafting
// paper with a faint grid, charcoal linework, one terracotta accent, and a
// floor plan in the hero that draws itself — a generic plan, not a claim
// about any project. Services are "scope" entries with dimension lines;
// the visit steps are the process.

const SERIF = "font-[family-name:var(--font-instrument)]";
const MONO = "font-mono";
const CLAY = "text-[#b5532f]";
const SOFT = "text-[#23211e]/70";
const LINE = "border-[#23211e]/20";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[84rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Sheet({ index, title }: { index: string; title: string }) {
  return (
    <p className={`${MONO} flex items-center gap-3 text-[11px] tracking-[0.14em] uppercase`}>
      <span className={`border border-[#b5532f] px-1.5 py-0.5 ${CLAY}`}>{index}</span>
      {title}
    </p>
  );
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`${MONO} inline-flex min-h-12 items-center justify-center gap-3 px-6 text-[12px] tracking-[0.14em] uppercase transition-colors ${
        solid ? "bg-[#23211e] text-[#e9e4dc] hover:bg-[#b5532f]" : "border border-[#23211e] text-[#23211e] hover:border-[#b5532f] hover:text-[#b5532f]"
      }`}
    >
      {children}
    </a>
  );
}

/** A floor plan drawn in line: rooms, door swings, a window. Decorative. */
function FloorPlan() {
  return (
    <svg aria-hidden viewBox="0 0 400 300" className="folio-plan h-auto w-full" fill="none" stroke="#23211e" strokeWidth="2">
      <rect x="20" y="20" width="360" height="260" />
      <path d="M20 150 H170 M170 20 V110 M170 140 V280 M170 200 H260 M260 200 V280 M290 20 V120 H380" />
      <path d="M170 110 A30 30 0 0 1 200 140" strokeWidth="1.2" />
      <path d="M260 230 A30 30 0 0 0 230 200" strokeWidth="1.2" />
      <path d="M90 20 H140" stroke="#b5532f" strokeWidth="5" />
      <path d="M380 180 V240" stroke="#b5532f" strokeWidth="5" />
      <rect x="45" y="45" width="90" height="55" rx="6" strokeWidth="1.2" />
      <circle cx="225" cy="70" r="28" strokeWidth="1.2" />
      <rect x="300" y="215" width="55" height="40" strokeWidth="1.2" />
      <path d="M20 296 H380 M20 291 V300 M380 291 V300" stroke="#b5532f" strokeWidth="1" />
    </svg>
  );
}

export function InteriorsEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#studio");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`interiors-folio min-h-dvh bg-[#e9e4dc] font-[family-name:var(--font-hanken)] text-[#23211e] antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#23211e", color: "rgba(233,228,220,.7)", strong: "#e9e4dc", accent: "#d9784f" }} />

      <header className={`sticky top-0 z-40 border-b ${LINE} bg-[#e9e4dc]/95 backdrop-blur-sm`}>
        <Wrap>
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className={`${SERIF} min-h-11 min-w-0 truncate pt-2.5 text-[24px]`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className={`${MONO} hidden text-[11px] tracking-[0.14em] uppercase lg:block`}>
              <ul className="flex items-center gap-8">
                <li>
                  <a href="#scope" className="hover:text-[#b5532f]">
                    A1 {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#process" className="hover:text-[#b5532f]">
                    A2 Process
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#notes" className="hover:text-[#b5532f]">
                      A3 Notes
                    </a>
                  </li>
                )}
                <li>
                  <a href="#studio" className="hover:text-[#b5532f]">
                    {hasFaq ? "A4" : "A3"} Studio
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className={`${MONO} inline-flex min-h-11 shrink-0 items-center bg-[#23211e] px-4 text-[11px] tracking-[0.12em] text-[#e9e4dc] uppercase transition-colors hover:bg-[#b5532f]`}
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Enquire</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="py-12 md:py-20" data-section="hero">
          <Wrap>
            <div className="grid items-end gap-12 lg:grid-cols-[1fr_1fr]">
              <div data-reveal>
                <Sheet index="A0" title={content.area ? `${chrome.noun} · ${content.area}` : chrome.noun} />
                <h1 className={`${SERIF} mt-8 ${content.businessName.length > 26 ? "text-[clamp(2.6rem,5.4vw,4.6rem)]" : "text-[clamp(3.2rem,7.6vw,6.6rem)]"} leading-[0.94] tracking-[-0.02em]`}>
                  {content.businessName}
                </h1>
                <p className={`${SERIF} mt-5 text-[clamp(1.4rem,2.4vw,2rem)] leading-snug italic ${CLAY}`}>{content.tagline}</p>
                <p className={`mt-6 max-w-lg text-[16.5px] leading-relaxed ${SOFT}`}>{content.intro}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta} solid>
                    {chrome.cta}
                  </Button>
                  <Button href="#scope">View the scope</Button>
                </div>
              </div>
              <figure className={`border ${LINE} bg-[#efebe4] p-6 sm:p-8`} data-reveal style={revealDelay(140)}>
                <FloorPlan />
                <figcaption className={`${MONO} mt-4 flex justify-between gap-4 text-[10.5px] tracking-[0.12em] uppercase ${SOFT}`}>
                  <span>Plan · illustrative</span>
                  <span>{content.rating !== undefined ? `${content.rating.toFixed(1)} on Google` : "Scale 1:50"}</span>
                </figcaption>
              </figure>
            </div>
          </Wrap>
        </section>

        <section className={`scroll-mt-20 border-t ${LINE} py-16 md:py-24`} id="scope" data-section="services">
          <Wrap>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]" data-reveal>
              <div>
                <Sheet index="A1" title={chrome.servicesKicker} />
                <h2 className={`${SERIF} mt-6 text-[clamp(2.3rem,4.8vw,4rem)] leading-[1]`}>
                  {chrome.servicesTitle} <em className={`italic ${CLAY}`}>{chrome.servicesEm}</em>
                </h2>
              </div>
              {note && <p className={`self-end text-[15px] leading-relaxed ${SOFT}`}>{note}</p>}
            </div>
            <ol className="mt-12 grid gap-px bg-[#23211e]/20 sm:grid-cols-2">
              {content.services.map((service, i) => (
                <li key={service.title} className="bg-[#e9e4dc] p-7" data-reveal style={revealDelay((i % 2) * 90)}>
                  <p className={`${MONO} text-[11px] tracking-[0.14em] ${CLAY}`}>SCOPE {pad(i)}</p>
                  <h3 className={`${SERIF} mt-3 text-[30px] leading-tight`}>{service.title}</h3>
                  <span aria-hidden className="folio-dimension my-4 block" />
                  <p className={`text-[15px] leading-relaxed ${SOFT}`}>{service.description}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        <section className="scroll-mt-20 bg-[#23211e] py-16 text-[#e9e4dc] md:py-24" id="process" data-section="visit">
          <Wrap>
            <div data-reveal>
              <p className={`${MONO} text-[11px] tracking-[0.14em] text-[#d9784f] uppercase`}>A2 · {chrome.visitKicker}</p>
              <h2 className={`${SERIF} mt-6 max-w-3xl text-[clamp(2.3rem,4.8vw,4rem)] leading-[1]`}>{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-0">
              {steps.map((step, i) => (
                <li key={step.title} className="relative md:pr-8" data-reveal style={revealDelay(i * 110)}>
                  <div className="flex items-center gap-3">
                    <span className={`${MONO} grid size-10 place-items-center border border-[#d9784f] text-[13px] text-[#d9784f]`}>{i + 1}</span>
                    <span aria-hidden className="hidden h-px flex-1 bg-[#e9e4dc]/25 md:block" />
                  </div>
                  <h3 className={`${SERIF} mt-5 text-[27px]`}>{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#e9e4dc]/70">{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className={`scroll-mt-20 border-b ${LINE} py-16 md:py-24`} id="notes" data-section="faq">
            <Wrap className="max-w-[60rem]">
              <div data-reveal>
                <Sheet index="A3" title="Notes" />
              </div>
              <ol className="mt-8 grid gap-6" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <li key={faq.question} className={`grid gap-2 border-t ${LINE} pt-5 sm:grid-cols-[4rem_1fr]`}>
                    <span className={`${MONO} text-[12px] ${CLAY}`}>N.{i + 1}</span>
                    <div>
                      <h3 className={`${SERIF} text-[24px] leading-snug`}>{faq.question}</h3>
                      <p className={`mt-2 text-[15.5px] leading-relaxed ${SOFT}`}>{faq.answer}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 py-16 md:py-24" id="studio" data-section="contact">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-2">
              <div data-reveal>
                <Sheet index={hasFaq ? "A4" : "A3"} title="Studio" />
                <h2 className={`${SERIF} mt-6 text-[clamp(2.3rem,4.6vw,3.8rem)] leading-[1]`}>
                  {chrome.closingTitle} <em className={`italic ${CLAY}`}>{chrome.closingEm}</em>
                </h2>
                <table className={`${MONO} mt-10 w-full border-collapse text-left text-[13px]`}>
                  <tbody>
                    {content.address && (
                      <tr className={`border-t ${LINE}`}>
                        <th scope="row" className={`w-28 py-4 align-top font-normal tracking-[0.12em] uppercase ${CLAY}`}>
                          Site
                        </th>
                        <td className="py-4 font-[family-name:var(--font-hanken)] text-[15px] leading-relaxed">{content.address}</td>
                      </tr>
                    )}
                    {content.phone && (
                      <tr className={`border-t ${LINE}`}>
                        <th scope="row" className={`py-4 align-top font-normal tracking-[0.12em] uppercase ${CLAY}`}>
                          Phone
                        </th>
                        <td className="py-4 font-[family-name:var(--font-hanken)] text-[15px]">
                          {links.call ? (
                            <a href={links.call} className="underline decoration-[#b5532f]/50 underline-offset-4">
                              {content.phone}
                            </a>
                          ) : (
                            content.phone
                          )}
                        </td>
                      </tr>
                    )}
                    <tr className={`border-t border-b ${LINE}`}>
                      <th scope="row" className={`py-4 align-top font-normal tracking-[0.12em] uppercase ${CLAY}`}>
                        Hours
                      </th>
                      <td className="py-4 font-[family-name:var(--font-hanken)] text-[15px]">By appointment — message or call to confirm</td>
                    </tr>
                  </tbody>
                </table>
                {content.reviewCount ? (
                  <p className={`${MONO} mt-4 text-[11px] tracking-[0.12em] uppercase ${SOFT}`}>
                    {chrome.ratingLabel} · {formatCount(content.reviewCount)} {chrome.reviewsLabel}
                  </p>
                ) : null}
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
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className={`min-h-80 border ${LINE} lg:h-full`} frameClassName="grayscale sepia-[.2] contrast-[1.05]" />
                </div>
              ) : null}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${LINE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${SOFT}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center self-start text-[22px] text-[#23211e]`}>
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
