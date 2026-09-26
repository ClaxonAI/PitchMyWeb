import "./restaurant.css";
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

// "Supper Club": the restaurant after dark. Near-black walls, cream type and
// an ember accent; Cormorant set huge and left-aligned; slow candle-glow
// gradients instead of food photos we do not have. The kitchen's list reads
// like a evening's courses, the rating sits in a round seal, and every
// button leads to a reservation by message.

const SERIF = "font-[family-name:var(--font-cormorant)]";
const EMBER = "text-[#e58a4e]";
const CREAM = "text-[#f1e6d6]";
const DIM = "text-[#f1e6d6]/65";
const LINE = "border-[#f1e6d6]/12";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[80rem] px-5 sm:px-10 ${className}`}>{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className={`flex items-center gap-3 text-[11px] font-semibold tracking-[0.36em] uppercase ${EMBER}`}>
      <span aria-hidden className="h-px w-8 bg-[#e58a4e]" />
      {children}
    </p>
  );
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-7 text-[12px] font-semibold tracking-[0.22em] uppercase transition-colors ${
        solid ? "bg-[#e58a4e] text-[#141110] hover:bg-[#f09d65]" : "border border-[#f1e6d6]/30 text-[#f1e6d6] hover:border-[#e58a4e] hover:text-[#e58a4e]"
      }`}
    >
      {children}
    </a>
  );
}

export function RestaurantAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#reservations");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`supper-club min-h-dvh bg-[#141110] font-[family-name:var(--font-hanken)] ${CREAM} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#0c0a09", color: "rgba(241,230,214,.6)", strong: "#f1e6d6", accent: "#e58a4e" }} />

      <header className={`sticky top-0 z-40 border-b ${LINE} bg-[#141110]/90 backdrop-blur-md`}>
        <Wrap>
          <div className="flex h-[70px] items-center justify-between gap-4">
            <a href="#top" className={`${SERIF} min-h-11 min-w-0 truncate pt-2 text-[26px] leading-none font-medium italic`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-9 text-[11px] font-semibold tracking-[0.3em] uppercase">
                <li>
                  <a href="#the-kitchen" className="hover:text-[#e58a4e]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#evening" className="hover:text-[#e58a4e]">
                    The evening
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#notes" className="hover:text-[#e58a4e]">
                      Notes
                    </a>
                  </li>
                )}
                <li>
                  <a href="#reservations" className="hover:text-[#e58a4e]">
                    Reservations
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#e58a4e] px-5 text-[11px] font-semibold tracking-[0.2em] text-[#141110] uppercase transition-colors hover:bg-[#f09d65]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Reserve</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 md:py-32" data-section="hero">
          <div aria-hidden className="supper-glow absolute top-[10%] right-[8%] size-[28rem] rounded-full bg-[radial-gradient(circle,rgba(229,138,78,.32),transparent_65%)]" />
          <div aria-hidden className="supper-glow absolute bottom-[-20%] left-[-10%] size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(180,70,40,.22),transparent_65%)] [animation-delay:2.5s]" />
          <Wrap className="relative">
            <div data-reveal>
              <Kicker>{content.area ? `Tonight in ${content.area}` : "Tonight"}</Kicker>
            </div>
            <h1 className={`${SERIF} mt-8 max-w-5xl ${content.businessName.length > 26 ? "text-[clamp(2.6rem,6.4vw,5.4rem)]" : "text-[clamp(3.4rem,11vw,9.5rem)]"} leading-[0.86] font-light tracking-[-0.02em]`} data-reveal style={revealDelay(90)}>
              {content.businessName}
            </h1>
            <div className="mt-10 grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-end">
              <div data-reveal style={revealDelay(160)}>
                <p className={`${SERIF} text-[clamp(1.5rem,2.8vw,2.3rem)] leading-snug italic ${EMBER}`}>{content.tagline}</p>
                <p className={`mt-5 max-w-lg text-[16.5px] leading-relaxed ${DIM}`}>{content.intro}</p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta} solid>
                    {chrome.cta}
                  </Button>
                  <Button href="#the-kitchen">From the kitchen</Button>
                </div>
              </div>
              {content.rating !== undefined && (
                <div className="md:justify-self-end" data-reveal style={revealDelay(220)}>
                  <div className="supper-seal grid size-44 place-items-center rounded-full border border-[#e58a4e]/60 text-center">
                    <div>
                      <p className={`${SERIF} text-[54px] leading-none font-light ${EMBER}`}>{content.rating.toFixed(1)}</p>
                      <p className={`mt-1 px-5 text-[10px] leading-snug font-semibold tracking-[0.22em] uppercase ${DIM}`}>
                        {content.reviewCount ? `${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : chrome.ratingLabel}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Wrap>
        </section>

        <section className={`scroll-mt-24 border-t ${LINE} py-16 md:py-24`} id="the-kitchen" data-section="services">
          <Wrap>
            <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
              <div data-reveal>
                <Kicker>{chrome.servicesKicker}</Kicker>
                <h2 className={`${SERIF} mt-6 text-[clamp(2.4rem,5vw,4.2rem)] leading-[0.98] font-light`}>
                  {chrome.servicesTitle} <em className={`italic ${EMBER}`}>{chrome.servicesEm}</em>
                </h2>
                {note && <p className={`mt-5 max-w-sm text-[15px] leading-relaxed ${DIM}`}>{note}</p>}
              </div>
              <ol>
                {content.services.map((service, i) => (
                  <li key={service.title} className={`group grid grid-cols-[3rem_1fr] gap-4 border-t ${LINE} py-7 last:border-b`} data-reveal style={revealDelay((i % 3) * 90)}>
                    <span className={`pt-2 text-[12px] font-semibold tracking-[0.2em] ${EMBER}`}>{pad(i)}</span>
                    <div>
                      <h3 className={`${SERIF} text-[clamp(1.8rem,3vw,2.5rem)] leading-tight font-light italic transition-colors group-hover:text-[#e58a4e]`}>{service.title}</h3>
                      <p className={`mt-2 max-w-xl text-[15.5px] leading-relaxed ${DIM}`}>{service.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-24 bg-[#1d1816] py-16 md:py-24" id="evening" data-section="visit">
          <Wrap>
            <div data-reveal>
              <Kicker>{chrome.visitKicker}</Kicker>
              <h2 className={`${SERIF} mt-6 max-w-3xl text-[clamp(2.3rem,4.6vw,3.8rem)] leading-[1] font-light`}>{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-[2rem] border border-[#f1e6d6]/10 bg-[#141110] p-8" data-reveal style={revealDelay(i * 110)}>
                  <p className={`${SERIF} text-[64px] leading-none font-light italic ${EMBER}`}>{i + 1}</p>
                  <h3 className={`${SERIF} mt-5 text-[28px] font-normal`}>{step.title}</h3>
                  <p className={`mt-2 text-[15px] leading-relaxed ${DIM}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className={`scroll-mt-24 border-t ${LINE} py-16 md:py-24`} id="notes" data-section="faq">
            <Wrap className="max-w-[58rem]">
              <div data-reveal>
                <Kicker>Notes for guests</Kicker>
              </div>
              <div className="mt-8" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${LINE}`} open={i === 0}>
                    <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[26px] font-light`}>
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[24px] transition-transform group-open:rotate-45 ${EMBER}`}>
                        +
                      </span>
                    </summary>
                    <p className={`max-w-2xl pb-7 text-[16px] leading-relaxed ${DIM}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-24 relative overflow-hidden py-16 md:py-24" id="reservations" data-section="contact">
          <div aria-hidden className="supper-glow absolute top-0 left-[calc(50%-15rem)] size-[30rem] rounded-full bg-[radial-gradient(circle,rgba(229,138,78,.18),transparent_65%)]" />
          <Wrap className="relative">
            <div className="grid gap-10 lg:grid-cols-2">
              <div data-reveal>
                <Kicker>Reservations</Kicker>
                <h2 className={`${SERIF} mt-6 text-[clamp(2.4rem,5vw,4.2rem)] leading-[0.98] font-light`}>
                  {chrome.closingTitle} <em className={`italic ${EMBER}`}>{chrome.closingEm}</em>
                </h2>
                <dl className={`mt-10 grid gap-6 border-t ${LINE} pt-6 text-[15.5px]`}>
                  {content.address && (
                    <div>
                      <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${EMBER}`}>Address</dt>
                      <dd className={`mt-2 leading-relaxed ${DIM}`}>{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${EMBER}`}>Telephone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className={`${SERIF} text-[26px] hover:text-[#e58a4e]`}>
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${EMBER}`}>Hours</dt>
                    <dd className={`mt-2 ${DIM}`}>Message or call to confirm tonight&apos;s hours</dd>
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
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed
                    content={content}
                    className="min-h-80 overflow-hidden rounded-[2rem] border border-[#f1e6d6]/10 lg:h-full"
                    frameClassName="grayscale invert-[.92] hue-rotate-180 sepia-[.3]"
                  />
                </div>
              ) : null}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${LINE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${DIM}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center self-start text-[26px] italic ${CREAM}`}>
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
