import "./salon.css";
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

// "Cover Story": the salon as a fashion-magazine cover. Blush paper, black
// Bodoni set edge to edge, a cover collage of pure shapes (no borrowed
// photos), coverlines built from real facts — the area, the rating, the
// number of services — and the service list as the issue's features.

const DIDONE = "font-[family-name:var(--font-bodoni)]";
const SANS = "font-[family-name:var(--font-hanken)]";
const INK = "text-[#121012]";
const SOFT = "text-[#121012]/70";
const HOT = "text-[#d0342c]";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[84rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center px-7 text-[12px] font-bold tracking-[0.24em] uppercase transition-colors ${
        solid ? "bg-[#121012] text-[#f6e3dc] hover:bg-[#d0342c]" : "border-2 border-[#121012] text-[#121012] hover:bg-[#121012] hover:text-[#f6e3dc]"
      }`}
    >
      {children}
    </a>
  );
}

/** Cover art: overlapping discs and a slab, like a styled shoot. Decorative. */
function CoverArt() {
  return (
    <div aria-hidden className="vogue-art relative aspect-[4/5] w-full">
      <div className="absolute inset-y-[6%] right-[4%] left-[18%] bg-[#121012]" />
      <div className="vogue-disc absolute top-[10%] left-0 size-[58%] rounded-full bg-[#d0342c] mix-blend-multiply" />
      <div className="vogue-disc absolute right-[10%] bottom-[12%] size-[46%] rounded-full bg-[#f0b8a8] [animation-delay:1.4s]" />
      <div className="absolute right-[18%] bottom-[34%] h-px w-[40%] bg-[#f6e3dc]" />
      <div className="absolute top-[22%] right-[12%] size-3 rounded-full bg-[#f6e3dc]" />
    </div>
  );
}

export function SalonEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#appointments");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  const coverlines = [
    content.area ? `The ${content.area} edit` : "The edit",
    content.rating !== undefined ? `${content.rating.toFixed(1)} stars on Google` : "Now booking",
    `${content.services.length} ${content.servicesAreGeneric ? "services to ask about" : "services inside"}`,
  ];

  return (
    <div className={`salon-vogue min-h-dvh bg-[#f6e3dc] ${SANS} ${INK} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#121012", color: "rgba(246,227,220,.7)", strong: "#f6e3dc", accent: "#d0342c" }} />

      <header className="sticky top-0 z-40 border-b-2 border-[#121012] bg-[#f6e3dc]/95 backdrop-blur-sm">
        <Wrap>
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className={`${DIDONE} min-h-11 min-w-0 truncate pt-2.5 text-[22px] font-semibold tracking-[0.02em] uppercase`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-8 text-[11px] font-bold tracking-[0.24em] uppercase">
                <li>
                  <a href="#features" className="hover:text-[#d0342c]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#how-to-book" className="hover:text-[#d0342c]">
                    {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#ask" className="hover:text-[#d0342c]">
                      Ask the salon
                    </a>
                  </li>
                )}
                <li>
                  <a href="#appointments" className="hover:text-[#d0342c]">
                    Appointments
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center bg-[#121012] px-4 text-[11px] font-bold tracking-[0.2em] text-[#f6e3dc] uppercase transition-colors hover:bg-[#d0342c]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="overflow-hidden pt-8 pb-16 md:pt-12 md:pb-24" data-section="hero">
          <Wrap>
            <div className="flex items-baseline justify-between border-b border-[#121012] pb-2 text-[11px] font-bold tracking-[0.24em] uppercase" data-reveal>
              <span>{chrome.noun}</span>
              <span className={HOT}>{content.area ?? "Beauty"}</span>
            </div>
            <h1
              className={`${DIDONE} mt-4 ${content.businessName.length > 26 ? "text-[clamp(2.6rem,7vw,6rem)]" : "text-[clamp(3.4rem,13vw,12rem)]"} leading-[0.82] font-bold tracking-[-0.035em] uppercase`}
              data-reveal
              style={revealDelay(80)}
            >
              {content.businessName}
            </h1>
            <div className="mt-10 grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-center">
              <div data-reveal style={revealDelay(140)}>
                <ul className="grid gap-4">
                  {coverlines.map((line, i) => (
                    <li key={line} className={`${DIDONE} border-b border-[#121012]/25 pb-3 text-[clamp(1.4rem,2.6vw,2.1rem)] leading-tight italic ${i === 1 ? HOT : ""}`}>
                      {line}
                    </li>
                  ))}
                </ul>
                <p className={`mt-7 max-w-md text-[16.5px] leading-relaxed ${SOFT}`}>{content.intro}</p>
                <p className="mt-4 text-[13px] font-bold tracking-[0.16em] uppercase">{content.tagline}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta} solid>
                    {chrome.cta}
                  </Button>
                  <Button href="#features">The services</Button>
                </div>
              </div>
              <div className="mx-auto w-full max-w-[30rem]" data-reveal style={revealDelay(200)}>
                <CoverArt />
              </div>
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-20 border-t-2 border-[#121012] bg-[#fbf1ec] py-16 md:py-24" id="features" data-section="services">
          <Wrap>
            <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-end md:gap-12" data-reveal>
              <p className={`${DIDONE} text-[clamp(5rem,12vw,9rem)] leading-[0.8] font-bold ${HOT}`}>{String(content.services.length).padStart(2, "0")}</p>
              <div>
                <p className="text-[11px] font-bold tracking-[0.24em] uppercase">{chrome.servicesKicker}</p>
                <h2 className={`${DIDONE} mt-3 text-[clamp(2.2rem,4.8vw,4rem)] leading-[0.98] font-semibold`}>
                  {chrome.servicesTitle} <em className={`italic ${HOT}`}>{chrome.servicesEm}</em>
                </h2>
              </div>
            </div>
            {note && <p className={`mt-6 max-w-2xl text-[15px] leading-relaxed ${SOFT}`}>{note}</p>}
            <ol className="mt-12 grid gap-x-10 border-t border-[#121012] md:grid-cols-2">
              {content.services.map((service, i) => (
                <li key={service.title} className="grid grid-cols-[3.5rem_1fr] gap-4 border-b border-[#121012]/25 py-7" data-reveal style={revealDelay((i % 2) * 90)}>
                  <span className={`${DIDONE} text-[34px] leading-none font-bold italic ${HOT}`}>{pad(i)}</span>
                  <div>
                    <h3 className={`${DIDONE} text-[27px] leading-tight font-semibold`}>{service.title}</h3>
                    <p className={`mt-2 text-[15px] leading-relaxed ${SOFT}`}>{service.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        <section className="scroll-mt-20 bg-[#121012] py-16 text-[#f6e3dc] md:py-24" id="how-to-book" data-section="visit">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
              <div data-reveal>
                <p className="text-[11px] font-bold tracking-[0.24em] text-[#f0b8a8] uppercase">{chrome.visitKicker}</p>
                <h2 className={`${DIDONE} mt-4 text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.95] font-semibold italic`}>{chrome.visitTitle}</h2>
                {content.rating !== undefined && (
                  <p className="mt-8 text-[13px] font-bold tracking-[0.18em] text-[#f6e3dc]/70 uppercase">
                    <span className={`${DIDONE} mr-2 text-[30px] tracking-normal text-[#f0b8a8] normal-case`}>{content.rating.toFixed(1)}</span>
                    {chrome.ratingLabel}
                    {content.reviewCount ? ` · ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : ""}
                  </p>
                )}
              </div>
              <ol className="grid gap-px bg-[#f6e3dc]/15">
                {steps.map((step, i) => (
                  <li key={step.title} className="grid grid-cols-[4rem_1fr] gap-4 bg-[#121012] py-6" data-reveal style={revealDelay(i * 110)}>
                    <span className={`${DIDONE} text-[44px] leading-none font-bold text-[#d0342c]`}>{i + 1}</span>
                    <div>
                      <h3 className="text-[15px] font-bold tracking-[0.18em] uppercase">{step.title}</h3>
                      <p className="mt-2 text-[15.5px] leading-relaxed text-[#f6e3dc]/75">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-20 py-16 md:py-24" id="ask" data-section="faq">
            <Wrap className="max-w-[60rem]">
              <p className="text-[11px] font-bold tracking-[0.24em] uppercase" data-reveal>
                Ask the salon
              </p>
              <div className="mt-6 border-t-2 border-[#121012]" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className="group border-b border-[#121012]/25" open={i === 0}>
                    <summary className={`${DIDONE} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[24px] font-semibold`}>
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[26px] transition-transform group-open:rotate-45 ${HOT}`}>
                        +
                      </span>
                    </summary>
                    <p className={`max-w-2xl pb-7 text-[16px] leading-relaxed ${SOFT}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 border-t-2 border-[#121012] py-16 md:py-24" id="appointments" data-section="contact">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-2">
              <div data-reveal>
                <p className={`text-[11px] font-bold tracking-[0.24em] uppercase ${HOT}`}>Appointments</p>
                <h2 className={`${DIDONE} mt-4 text-[clamp(2.3rem,4.8vw,4rem)] leading-[0.98] font-semibold`}>
                  {chrome.closingTitle} <em className={`italic ${HOT}`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-10 grid gap-6 border-t border-[#121012] pt-6 text-[15.5px] sm:grid-cols-2">
                  {content.address && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-bold tracking-[0.24em] uppercase">Address</dt>
                      <dd className={`mt-2 leading-relaxed ${SOFT}`}>{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className="text-[11px] font-bold tracking-[0.24em] uppercase">Phone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className="font-bold underline decoration-[#d0342c] decoration-2 underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[11px] font-bold tracking-[0.24em] uppercase">Hours</dt>
                    <dd className={`mt-2 ${SOFT}`}>Message or call to confirm today&apos;s hours</dd>
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
                  <p className={`mt-10 text-[15px] ${SOFT}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className="min-h-80 border-2 border-[#121012] lg:h-full" frameClassName="grayscale contrast-[1.15]" />
                </div>
              ) : (
                <div className="hidden lg:block">
                  <CoverArt />
                </div>
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t-2 border-[#121012] pb-24 lg:pb-0">
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${SOFT}`}>
          <a href="#top" className={`${DIDONE} inline-flex min-h-11 items-center self-start text-[22px] font-semibold uppercase ${INK}`}>
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
