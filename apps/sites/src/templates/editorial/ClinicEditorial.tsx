import "./clinic.css";
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

// "The Report": a clinic laid out like a clear medical brief — Swiss grid,
// white paper, black type, one cobalt signal colour and a slow heartbeat
// line across the hero. Every block is a labelled field, the way a good
// report reads; the care list is a numbered table. Only discovered facts.

const GROTESK = "font-[family-name:var(--font-hanken)]";
const COBALT = "text-[#1f4bd8]";
const MUTED = "text-[#55575c]";
const RULE = "border-[#0b0b0c]/12";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[84rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border-t ${RULE} pt-3 ${className}`}>
      <p className="font-mono text-[11px] tracking-[0.12em] text-[#0b0b0c]/55 uppercase">{label}</p>
      <div className="mt-2 text-[15px] leading-relaxed">{children}</div>
    </div>
  );
}

function Heading({ index, kicker, children }: { index: string; kicker: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-12" data-reveal>
      <p className="font-mono text-[12px] tracking-[0.12em] uppercase md:col-span-3">
        <span className={COBALT}>{index}</span> / {kicker}
      </p>
      <h2 className={`${GROTESK} text-[clamp(2rem,4.6vw,3.9rem)] leading-[0.98] font-bold tracking-[-0.04em] md:col-span-9`}>{children}</h2>
    </div>
  );
}

function Button({ href, children, invert = false }: { href: string; children: React.ReactNode; invert?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`group inline-flex min-h-12 items-center justify-between gap-6 px-5 text-[14px] font-semibold transition-colors ${
        invert ? "bg-white text-[#0b0b0c] hover:bg-[#dfe6ff]" : "bg-[#0b0b0c] text-white hover:bg-[#1f4bd8]"
      }`}
    >
      {children}
      <span aria-hidden className="transition-transform group-hover:translate-x-1">
        →
      </span>
    </a>
  );
}

/** The hero's heartbeat trace. Decorative. */
function Pulse() {
  return (
    <svg aria-hidden viewBox="0 0 1200 120" preserveAspectRatio="none" className="clinic-pulse h-24 w-full md:h-28">
      <path
        d="M0 70 H380 L410 70 L430 30 L452 104 L474 14 L496 86 L512 70 H760 L786 70 L802 48 L820 92 L836 70 H1200"
        fill="none"
        stroke="#1f4bd8"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClinicEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#contact");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`clinic-report min-h-dvh bg-[#fbfbf9] ${GROTESK} text-[#0b0b0c] antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#0b0b0c", color: "rgba(255,255,255,.7)", strong: "#ffffff", accent: "#5b7cff" }} />

      <header className={`sticky top-0 z-40 border-b ${RULE} bg-[#fbfbf9]/95 backdrop-blur`}>
        <Wrap>
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className="flex min-h-11 min-w-0 items-center gap-3">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center bg-[#1f4bd8] text-[18px] leading-none font-bold text-white">
                +
              </span>
              <span className="truncate text-[17px] font-bold tracking-[-0.02em]">{content.businessName}</span>
            </a>
            <nav aria-label="Sections" className="hidden font-mono text-[12px] tracking-[0.1em] uppercase lg:block">
              <ul className="flex items-center gap-8">
                <li>
                  <a href="#care" className="hover:text-[#1f4bd8]">
                    01 {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#visit" className="hover:text-[#1f4bd8]">
                    02 {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#faq" className="hover:text-[#1f4bd8]">
                      03 Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#contact" className="hover:text-[#1f4bd8]">
                    {hasFaq ? "04" : "03"} Contact
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center bg-[#0b0b0c] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1f4bd8]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="pt-12 md:pt-20" data-section="hero">
          <Wrap>
            <div className="grid gap-4 font-mono text-[12px] tracking-[0.1em] uppercase sm:grid-cols-3" data-reveal>
              <p>{chrome.noun}</p>
              <p className={MUTED}>{content.area ?? "Patient information"}</p>
              <p className={`sm:text-right ${COBALT}`}>{content.rating !== undefined ? `${content.rating.toFixed(1)} / 5 on Google` : "Open to new patients"}</p>
            </div>
            <h1 className={`mt-8 ${content.businessName.length > 26 ? "text-[clamp(2.4rem,5.6vw,5rem)]" : "text-[clamp(3rem,9vw,8.4rem)]"} leading-[0.9] font-bold tracking-[-0.055em]`} data-reveal style={revealDelay(80)}>
              {content.businessName}
              <span className="text-[#1f4bd8]">.</span>
            </h1>
          </Wrap>
          <div className="mt-6" data-reveal style={revealDelay(140)}>
            <Pulse />
          </div>
          <Wrap>
            <div className={`grid gap-8 border-t ${RULE} py-10 md:grid-cols-12 md:py-14`}>
              <p className="text-[clamp(1.4rem,2.4vw,2rem)] leading-[1.2] font-semibold tracking-[-0.02em] md:col-span-5" data-reveal>
                {content.tagline}
              </p>
              <div className="md:col-span-6 md:col-start-7" data-reveal style={revealDelay(100)}>
                <p className={`text-[17px] leading-relaxed ${MUTED}`}>{content.intro}</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <Button href={cta}>{chrome.cta}</Button>
                  <a
                    href="#care"
                    className="inline-flex min-h-12 items-center justify-between gap-6 border border-[#0b0b0c] px-5 text-[14px] font-semibold transition-colors hover:border-[#1f4bd8] hover:text-[#1f4bd8]"
                  >
                    See {chrome.navServices.toLowerCase()} <span aria-hidden>↓</span>
                  </a>
                </div>
              </div>
            </div>
          </Wrap>
        </section>

        <section className={`scroll-mt-20 border-t ${RULE} py-16 md:py-24`} id="care" data-section="services">
          <Wrap>
            <Heading index="01" kicker={chrome.servicesKicker}>
              {chrome.servicesTitle} <span className={COBALT}>{chrome.servicesEm}</span>
            </Heading>
            {note && <p className={`mt-6 max-w-2xl text-[15px] leading-relaxed md:ml-[25%] ${MUTED}`}>{note}</p>}
            <div className="mt-10 md:ml-[25%]">
              <div className={`hidden grid-cols-[4rem_1fr_1.4fr] gap-6 border-b-2 border-[#0b0b0c] pb-3 font-mono text-[11px] tracking-[0.12em] uppercase md:grid`}>
                <span>No.</span>
                <span>Care</span>
                <span>Details</span>
              </div>
              <ol>
                {content.services.map((service, i) => (
                  <li key={service.title} className={`grid gap-2 border-b ${RULE} py-6 md:grid-cols-[4rem_1fr_1.4fr] md:gap-6`} data-reveal style={revealDelay((i % 3) * 70)}>
                    <span className={`font-mono text-[13px] ${COBALT}`}>{pad(i)}</span>
                    <h3 className="text-[21px] leading-tight font-bold tracking-[-0.02em]">{service.title}</h3>
                    <p className={`text-[15px] leading-relaxed ${MUTED}`}>{service.description}</p>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {content.rating !== undefined && (
          <section className="bg-[#1f4bd8] py-14 text-white md:py-20" aria-label={chrome.ratingLabel} data-section="rating">
            <Wrap>
              <div className="grid items-end gap-6 md:grid-cols-12" data-reveal>
                <p className="text-[clamp(5rem,14vw,11rem)] leading-[0.8] font-bold tracking-[-0.06em] md:col-span-5">{content.rating.toFixed(1)}</p>
                <div className="md:col-span-7">
                  <p className="font-mono text-[12px] tracking-[0.12em] text-white/75 uppercase">{chrome.ratingLabel}</p>
                  <p className="mt-3 text-[clamp(1.4rem,2.6vw,2.2rem)] leading-tight font-semibold tracking-[-0.02em]">
                    out of 5{content.reviewCount ? `, from ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}.` : "."}
                  </p>
                </div>
              </div>
            </Wrap>
          </section>
        )}

        <section className={`scroll-mt-20 py-16 md:py-24`} id="visit" data-section="visit">
          <Wrap>
            <Heading index="02" kicker={chrome.visitKicker}>
              {chrome.visitTitle}
            </Heading>
            <ol className="mt-12 grid gap-px bg-[#0b0b0c]/12 md:ml-[25%] md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="bg-[#fbfbf9] p-6 md:p-8" data-reveal style={revealDelay(i * 100)}>
                  <p className="text-[56px] leading-none font-bold tracking-[-0.05em] text-[#1f4bd8]">{i + 1}</p>
                  <h3 className="mt-6 text-[20px] font-bold tracking-[-0.02em]">{step.title}</h3>
                  <p className={`mt-2 text-[15px] leading-relaxed ${MUTED}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className={`scroll-mt-20 border-t ${RULE} bg-[#f1f1ee] py-16 md:py-24`} id="faq" data-section="faq">
            <Wrap>
              <Heading index="03" kicker="Questions">
                Straight <span className={COBALT}>answers.</span>
              </Heading>
              <div className="mt-10 md:ml-[25%]" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${RULE}`} open={i === 0}>
                    <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-[19px] font-bold tracking-[-0.01em]">
                      {faq.question}
                      <span aria-hidden className="font-mono text-[18px] text-[#1f4bd8] transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className={`max-w-2xl pb-6 text-[15.5px] leading-relaxed ${MUTED}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 bg-[#0b0b0c] py-16 text-white md:py-24" id="contact" data-section="contact">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-12">
              <div className="lg:col-span-6" data-reveal>
                <p className="font-mono text-[12px] tracking-[0.12em] uppercase">
                  <span className="text-[#7d97ff]">{hasFaq ? "04" : "03"}</span> / Contact
                </p>
                <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.6rem)] leading-[1] font-bold tracking-[-0.04em]">
                  {chrome.closingTitle} <span className="text-[#7d97ff]">{chrome.closingEm}</span>
                </h2>
                <div className="mt-10 grid gap-6 sm:grid-cols-2 [&_div]:border-white/20 [&_p:first-child]:text-white/60">
                  {content.address && (
                    <Field label="Address" className="sm:col-span-2">
                      {content.address}
                    </Field>
                  )}
                  {content.phone && (
                    <Field label="Phone">
                      {links.call ? (
                        <a href={links.call} className="underline decoration-[#7d97ff] underline-offset-4">
                          {content.phone}
                        </a>
                      ) : (
                        content.phone
                      )}
                    </Field>
                  )}
                  <Field label="Hours">Message or call to confirm today&apos;s hours</Field>
                </div>
                {actions.length > 0 ? (
                  <div className="mt-10 grid gap-3 sm:grid-cols-2">
                    {actions.map((action, i) => (
                      <Button key={action.key} href={action.href} invert={i === 0}>
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-10 text-[15px] text-white/70">{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery && (
                <div className="lg:col-span-6" data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className="min-h-80 lg:h-full" frameClassName="grayscale contrast-[1.1]" />
                </div>
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${RULE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${MUTED}`}>
          <a href="#top" className="inline-flex min-h-11 items-center self-start text-[17px] font-bold text-[#0b0b0c]">
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
