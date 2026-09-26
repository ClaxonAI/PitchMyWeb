import "./gym.css";
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

// "Members' Club": the gym as a quiet, high-end training club. Strict black
// and white, very large light type, hairlines, and one slow pulse of rings in
// the hero — breath, not hype. The training list inverts on hover like a
// lit studio door. Only the facts discovery found.

const SANS = "font-[family-name:var(--font-hanken)]";
const DIM = "text-white/60";
const LINE = "border-white/15";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[86rem] px-5 sm:px-10 ${className}`}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[11px] font-medium tracking-[0.34em] uppercase">
      <span aria-hidden className="club-dot size-1.5 rounded-full bg-white" />
      {children}
    </p>
  );
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center px-8 text-[12px] font-medium tracking-[0.28em] uppercase transition-colors ${
        solid ? "bg-white text-black hover:bg-white/85" : "border border-white/35 text-white hover:border-white"
      }`}
    >
      {children}
    </a>
  );
}

export function GymAtelier({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#visit-the-club");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`gym-club min-h-dvh bg-black ${SANS} text-white antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#111111", color: "rgba(255,255,255,.6)", strong: "#ffffff", accent: "#ffffff" }} />

      <header className={`sticky top-0 z-40 border-b ${LINE} bg-black/85 backdrop-blur-md`}>
        <Wrap>
          <div className="flex h-[72px] items-center justify-between gap-4">
            <a href="#top" className="min-h-11 min-w-0 truncate pt-3 text-[15px] font-medium tracking-[0.3em] uppercase">
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-10 text-[11px] font-medium tracking-[0.3em] uppercase">
                <li>
                  <a href="#programme" className="text-white/70 hover:text-white">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#membership" className="text-white/70 hover:text-white">
                    {chrome.navVisit}
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#questions" className="text-white/70 hover:text-white">
                      Questions
                    </a>
                  </li>
                )}
                <li>
                  <a href="#visit-the-club" className="text-white/70 hover:text-white">
                    The club
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center bg-white px-5 text-[11px] font-medium tracking-[0.24em] text-black uppercase transition-colors hover:bg-white/85"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="relative overflow-hidden" data-section="hero">
          <Wrap>
            <div className="grid min-h-[78vh] items-center gap-10 py-16 lg:grid-cols-[1.2fr_.8fr]">
              <div data-reveal>
                <Label>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Label>
                <h1
                  className={`mt-8 ${content.businessName.length > 24 ? "text-[clamp(2.6rem,6vw,5.2rem)]" : "text-[clamp(3.6rem,10vw,8.6rem)]"} leading-[0.9] font-extralight tracking-[-0.04em]`}
                >
                  {content.businessName}
                </h1>
                <p className="mt-8 max-w-xl text-[clamp(1.2rem,2vw,1.6rem)] leading-snug font-light">{content.tagline}.</p>
                <p className={`mt-4 max-w-lg text-[16px] leading-relaxed ${DIM}`}>{content.intro}</p>
                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta} solid>
                    {chrome.cta}
                  </Button>
                  <Button href="#programme">The programme</Button>
                </div>
              </div>
              <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[26rem]" data-reveal style={revealDelay(160)}>
                {[0, 1, 2, 3].map((ring) => (
                  <span key={ring} className="club-ring absolute inset-0 rounded-full border border-white/25" style={{ animationDelay: `${ring * 1.1}s` }} />
                ))}
                <span className="absolute inset-[38%] rounded-full bg-white" />
              </div>
            </div>
          </Wrap>
          {content.rating !== undefined && (
            <div className={`border-t ${LINE}`}>
              <Wrap>
                <p className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-6 text-[12px] tracking-[0.28em] uppercase" data-reveal>
                  <span className="text-[34px] font-extralight tracking-[-0.02em] normal-case">{content.rating.toFixed(1)}</span>
                  <span className={DIM}>{chrome.ratingLabel}</span>
                  {content.reviewCount ? <span className={DIM}>{formatCount(content.reviewCount)} {chrome.reviewsLabel}</span> : null}
                </p>
              </Wrap>
            </div>
          )}
        </section>

        <section className={`scroll-mt-24 border-t ${LINE} py-16 md:py-24`} id="programme" data-section="services">
          <Wrap>
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end" data-reveal>
              <div>
                <Label>{chrome.servicesKicker}</Label>
                <h2 className="mt-6 text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.95] font-extralight tracking-[-0.035em]">
                  {chrome.servicesTitle} <span className="font-medium">{chrome.servicesEm}</span>
                </h2>
              </div>
              {note && <p className={`max-w-md text-[15px] leading-relaxed lg:justify-self-end ${DIM}`}>{note}</p>}
            </div>
            <ol className={`mt-12 border-t ${LINE}`}>
              {content.services.map((service, i) => (
                <li
                  key={service.title}
                  className={`group grid gap-2 border-b ${LINE} px-2 py-7 transition-colors hover:bg-white hover:text-black md:grid-cols-[6rem_1fr_1fr] md:items-baseline md:gap-8 md:px-4`}
                  data-reveal
                  style={revealDelay((i % 3) * 80)}
                >
                  <span className="text-[13px] tracking-[0.3em] text-white/50 group-hover:text-black/50">{pad(i)}</span>
                  <h3 className="text-[clamp(1.6rem,2.8vw,2.4rem)] leading-tight font-light tracking-[-0.02em]">{service.title}</h3>
                  <p className="text-[15px] leading-relaxed text-white/60 group-hover:text-black/65">{service.description}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        <section className="scroll-mt-24 bg-white py-16 text-black md:py-24" id="membership" data-section="visit">
          <Wrap>
            <div data-reveal>
              <p className="text-[11px] font-medium tracking-[0.34em] uppercase">{chrome.visitKicker}</p>
              <h2 className="mt-6 max-w-4xl text-[clamp(2.3rem,4.8vw,4.2rem)] leading-[0.98] font-extralight tracking-[-0.035em]">{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-14 grid md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="border-t border-black/15 py-8 md:border-t-0 md:border-l md:px-8 md:py-2 md:first:border-l-0 md:first:pl-0" data-reveal style={revealDelay(i * 110)}>
                  <p className="text-[64px] leading-none font-extralight tracking-[-0.04em]">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-6 text-[20px] font-medium">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-black/60">{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-24 py-16 md:py-24" id="questions" data-section="faq">
            <Wrap className="max-w-[60rem]">
              <div data-reveal>
                <Label>Questions</Label>
              </div>
              <div className={`mt-8 border-t ${LINE}`} data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className={`group border-b ${LINE}`} open={i === 0}>
                    <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-6 py-5 text-[21px] font-light">
                      {faq.question}
                      <span aria-hidden className="shrink-0 text-[22px] font-extralight transition-transform group-open:rotate-45">
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

        <section className={`scroll-mt-24 border-t ${LINE} py-16 md:py-24`} id="visit-the-club" data-section="contact">
          <Wrap>
            <div className="grid gap-12 lg:grid-cols-2">
              <div data-reveal>
                <Label>The club</Label>
                <h2 className="mt-6 text-[clamp(2.3rem,4.8vw,4.2rem)] leading-[0.98] font-extralight tracking-[-0.035em]">
                  {chrome.closingTitle} <span className="font-medium">{chrome.closingEm}</span>
                </h2>
                <dl className={`mt-10 grid gap-6 border-t ${LINE} pt-6 text-[15.5px]`}>
                  {content.address && (
                    <div>
                      <dt className="text-[11px] tracking-[0.3em] text-white/50 uppercase">Address</dt>
                      <dd className="mt-2 leading-relaxed font-light">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className="text-[11px] tracking-[0.3em] text-white/50 uppercase">Phone</dt>
                      <dd className="mt-2">
                        {links.call ? (
                          <a href={links.call} className="text-[24px] font-extralight hover:underline">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[11px] tracking-[0.3em] text-white/50 uppercase">Hours</dt>
                    <dd className="mt-2 font-light">Message or call to confirm today&apos;s hours</dd>
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
                  <MapEmbed content={content} className={`min-h-80 border ${LINE} lg:h-full`} frameClassName="grayscale invert contrast-[1.1]" />
                </div>
              ) : null}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className={`border-t ${LINE} pb-24 lg:pb-0`}>
        <Wrap className={`flex flex-col gap-3 py-8 text-[13px] sm:flex-row sm:items-center sm:justify-between ${DIM}`}>
          <a href="#top" className="inline-flex min-h-11 items-center self-start text-[13px] font-medium tracking-[0.3em] text-white uppercase">
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
