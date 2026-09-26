import "./event.css";
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

// "The Invitation": the planner's site as fine stationery. Ivory card stock,
// blush envelope lining, gold-foil type that catches the light, deckled
// edges and a wax seal. The services are "the programme", the steps are "the
// order of the day", and the contact block is an RSVP card. No dates,
// couples or venues are invented.

const SERIF = "font-[family-name:var(--font-instrument)]";
const SANS = "font-[family-name:var(--font-hanken)]";
const INK = "text-[#3b2f2c]";
const SOFT = "text-[#3b2f2c]/70";
const GOLD = "text-[#a8833f]";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[70rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Flourish() {
  return (
    <svg aria-hidden viewBox="0 0 160 16" className="mx-auto h-4 w-40" fill="none" stroke="#a8833f" strokeWidth="1">
      <path d="M0 8 H58 M102 8 H160" />
      <path d="M62 8 C68 0 74 0 80 8 C86 16 92 16 98 8" />
      <circle cx="80" cy="8" r="2" fill="#a8833f" stroke="none" />
    </svg>
  );
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`${SANS} inline-flex min-h-12 items-center justify-center rounded-full px-8 text-[12px] font-semibold tracking-[0.24em] uppercase transition-colors ${
        solid ? "bg-[#3b2f2c] text-[#fbf7f0] hover:bg-[#a8833f]" : "border border-[#a8833f]/60 text-[#3b2f2c] hover:border-[#a8833f] hover:text-[#a8833f]"
      }`}
    >
      {children}
    </a>
  );
}

export function EventEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#rsvp");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`event-invite min-h-dvh bg-[#ecd9d0] ${SANS} ${INK} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#3b2f2c", color: "rgba(251,247,240,.7)", strong: "#fbf7f0", accent: "#d9b56e" }} />

      <header className="sticky top-0 z-40 border-b border-[#3b2f2c]/10 bg-[#fbf7f0]/92 backdrop-blur-sm">
        <Wrap className="max-w-[80rem]">
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className={`${SERIF} min-h-11 min-w-0 truncate pt-2.5 text-[23px] italic`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-8 text-[11px] font-semibold tracking-[0.24em] uppercase">
                <li>
                  <a href="#programme" className="hover:text-[#a8833f]">
                    The programme
                  </a>
                </li>
                <li>
                  <a href="#order-of-the-day" className="hover:text-[#a8833f]">
                    Order of the day
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#details" className="hover:text-[#a8833f]">
                      Details
                    </a>
                  </li>
                )}
                <li>
                  <a href="#rsvp" className="hover:text-[#a8833f]">
                    RSVP
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#3b2f2c] px-5 text-[11px] font-semibold tracking-[0.2em] text-[#fbf7f0] uppercase transition-colors hover:bg-[#a8833f]"
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
            <div className="invite-card relative mx-auto max-w-3xl px-7 py-16 text-center sm:px-16 md:py-24" data-reveal>
              <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</p>
              <p className={`${SERIF} mt-8 text-[20px] italic ${SOFT}`}>You are warmly invited to plan with</p>
              <h1 className={`${SERIF} invite-foil mt-4 ${content.businessName.length > 26 ? "text-[clamp(2.4rem,5.6vw,4.4rem)]" : "text-[clamp(3rem,8vw,6.4rem)]"} leading-[1] italic`}>
                {content.businessName}
              </h1>
              <div className="mt-8">
                <Flourish />
              </div>
              <p className={`${SERIF} mx-auto mt-8 max-w-xl text-[clamp(1.3rem,2.2vw,1.7rem)] leading-snug`}>{content.tagline}</p>
              <p className={`mx-auto mt-5 max-w-lg text-[16px] leading-relaxed ${SOFT}`}>{content.intro}</p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button href={cta} solid>
                  {chrome.cta}
                </Button>
                <Button href="#programme">The programme</Button>
              </div>
              <span aria-hidden className="invite-seal absolute -bottom-9 left-1/2 grid size-[4.5rem] -translate-x-1/2 place-items-center rounded-full">
                <span className={`${SERIF} text-[26px] text-[#fbeee6] italic`}>{content.businessName.charAt(0)}</span>
              </span>
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-20 py-16 md:py-24" id="programme" data-section="services">
          <Wrap>
            <div className="text-center" data-reveal>
              <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>The programme</p>
              <h2 className={`${SERIF} mx-auto mt-5 max-w-2xl text-[clamp(2.3rem,4.8vw,3.8rem)] leading-[1.02]`}>
                {chrome.servicesTitle} <em className={`italic ${GOLD}`}>{chrome.servicesEm}</em>
              </h2>
              {note && <p className={`mx-auto mt-4 max-w-xl text-[15px] leading-relaxed ${SOFT}`}>{note}</p>}
            </div>
            <ul className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-2">
              {content.services.map((service, i) => (
                <li key={service.title} className="rounded-sm bg-[#fbf7f0] px-8 py-9 text-center shadow-[0_18px_40px_-28px_rgba(59,47,44,.55)]" data-reveal style={revealDelay((i % 2) * 90)}>
                  <p aria-hidden className={`text-[14px] ${GOLD}`}>✧</p>
                  <h3 className={`${SERIF} mt-3 text-[28px] leading-tight italic`}>{service.title}</h3>
                  <p className={`mx-auto mt-3 max-w-sm text-[15px] leading-relaxed ${SOFT}`}>{service.description}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-20 bg-[#fbf7f0] py-16 md:py-24" id="order-of-the-day" data-section="visit">
          <Wrap>
            <div className="text-center" data-reveal>
              <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>Order of the day</p>
              <h2 className={`${SERIF} mx-auto mt-5 max-w-2xl text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.04]`}>{chrome.visitTitle}</h2>
              <div className="mt-6">
                <Flourish />
              </div>
            </div>
            <ol className="mx-auto mt-12 grid max-w-3xl gap-10">
              {steps.map((step, i) => (
                <li key={step.title} className="grid items-baseline gap-2 text-center sm:grid-cols-[1fr_auto_1fr] sm:gap-8 sm:text-left" data-reveal style={revealDelay(i * 110)}>
                  <h3 className={`${SERIF} text-[28px] italic sm:text-right`}>{step.title}</h3>
                  <span className={`${SERIF} text-[22px] ${GOLD}`}>{["I", "II", "III"][i]}</span>
                  <p className={`text-[15.5px] leading-relaxed ${SOFT}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-20 py-16 md:py-24" id="details" data-section="faq">
            <Wrap className="max-w-[50rem]">
              <div className="text-center" data-reveal>
                <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>Details</p>
              </div>
              <div className="mt-8 grid gap-4" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className="group rounded-sm bg-[#fbf7f0] px-7" open={i === 0}>
                    <summary className={`${SERIF} flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-[23px] italic`}>
                      {faq.question}
                      <span aria-hidden className={`shrink-0 text-[20px] not-italic transition-transform group-open:rotate-45 ${GOLD}`}>
                        +
                      </span>
                    </summary>
                    <p className={`pb-6 text-[15.5px] leading-relaxed ${SOFT}`}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 pb-20 md:pb-28" id="rsvp" data-section="contact">
          <Wrap>
            <div className="invite-card grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
              <div data-reveal>
                <p className={`text-[11px] font-semibold tracking-[0.34em] uppercase ${GOLD}`}>RSVP</p>
                <h2 className={`${SERIF} mt-5 text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.02]`}>
                  {chrome.closingTitle} <em className={`italic ${GOLD}`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-8 grid gap-5 text-[15.5px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${GOLD}`}>Where</dt>
                      <dd className="mt-1 leading-relaxed">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${GOLD}`}>Telephone</dt>
                      <dd className="mt-1">
                        {links.call ? (
                          <a href={links.call} className="underline decoration-[#a8833f]/50 underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[10.5px] font-semibold tracking-[0.3em] uppercase ${GOLD}`}>Kindly reply</dt>
                    <dd className={`mt-1 ${SOFT}`}>With your date and guest count — they will confirm availability</dd>
                  </div>
                </dl>
                {content.rating !== undefined && (
                  <p className={`mt-6 text-[12px] tracking-[0.2em] uppercase ${SOFT}`}>
                    <span className={`${SERIF} mr-2 text-[26px] tracking-normal italic ${GOLD}`}>{content.rating.toFixed(1)}</span>
                    {chrome.ratingLabel}
                    {content.reviewCount ? ` · ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : ""}
                  </p>
                )}
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
                  <MapEmbed content={content} className="min-h-80 lg:h-full" frameClassName="sepia-[.35] saturate-[.75] brightness-[1.03]" />
                </div>
              ) : null}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="bg-[#fbf7f0] pb-24 lg:pb-0">
        <Wrap className={`flex flex-col items-center gap-3 py-10 text-center text-[13px] ${SOFT}`}>
          <a href="#top" className={`${SERIF} inline-flex min-h-11 items-center text-[24px] italic ${INK}`}>
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
