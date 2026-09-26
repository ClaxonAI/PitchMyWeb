import "./restaurant.css";
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

// "The Menu": a restaurant site set like a printed menu card — letterpress
// paper, oxblood ink, a double-ruled frame and fleurons. The kitchen's list
// is laid out as menu lines with dotted leaders that end in an ornament, not
// a price: we never invent prices or dishes. The rating is the guest-book
// figure, the visit steps are "how to reserve".

const DISPLAY = "font-[family-name:var(--font-fraunces)]";
const BODY = "font-[family-name:var(--font-gelasio)]";
const WINE = "text-[#7a2020]";
const INK = "text-[#2a1f1a]";
const SOFT = "text-[#2a1f1a]/70";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[64rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Fleuron({ className = "" }: { className?: string }) {
  return (
    <p aria-hidden className={`flex items-center justify-center gap-4 ${WINE} ${className}`}>
      <span className="h-px w-16 bg-[#7a2020]/40" />
      <span className="text-[18px]">❦</span>
      <span className="h-px w-16 bg-[#7a2020]/40" />
    </p>
  );
}

function Ribbon({ children }: { children: React.ReactNode }) {
  return <p className={`text-center text-[12px] tracking-[0.34em] uppercase ${WINE}`}>{children}</p>;
}

function Button({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center px-7 text-[13px] tracking-[0.2em] uppercase transition-colors ${
        solid ? "bg-[#7a2020] text-[#f7f1e3] hover:bg-[#5e1717]" : "border border-[#7a2020]/50 text-[#7a2020] hover:bg-[#7a2020] hover:text-[#f7f1e3]"
      }`}
    >
      {children}
    </a>
  );
}

export function RestaurantEditorial({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#find-the-table");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const hasFaq = content.faqs.length > 0;

  return (
    <div className={`menu-card min-h-dvh bg-[#f7f1e3] ${BODY} ${INK} antialiased [overflow-wrap:break-word]`} id="top">
      <ConceptRibbon
        name={content.businessName}
        tone={{ background: "#2a1f1a", color: "rgba(247,241,227,.72)", strong: "#f7f1e3", accent: "#d9a35b", fontFamily: "var(--font-hanken)" }}
      />

      <header className="sticky top-0 z-40 border-b border-[#7a2020]/20 bg-[#f7f1e3]/95 backdrop-blur-sm">
        <Wrap className="max-w-[76rem]">
          <div className="flex h-16 items-center justify-between gap-4">
            <a href="#top" className={`${DISPLAY} min-h-11 min-w-0 truncate pt-2.5 text-[21px] italic ${WINE}`}>
              {content.businessName}
            </a>
            <nav aria-label="Sections" className="hidden md:block">
              <ul className="flex items-center gap-8 text-[12px] tracking-[0.24em] uppercase">
                <li>
                  <a href="#menu" className="hover:text-[#7a2020]">
                    {chrome.navServices}
                  </a>
                </li>
                <li>
                  <a href="#reserve" className="hover:text-[#7a2020]">
                    Reserve
                  </a>
                </li>
                {hasFaq && (
                  <li>
                    <a href="#good-to-know" className="hover:text-[#7a2020]">
                      Good to know
                    </a>
                  </li>
                )}
                <li>
                  <a href="#find-the-table" className="hover:text-[#7a2020]">
                    {chrome.navVisit}
                  </a>
                </li>
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center bg-[#7a2020] px-4 text-[12px] tracking-[0.18em] text-[#f7f1e3] uppercase transition-colors hover:bg-[#5e1717]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Reserve</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="py-10 md:py-16" data-section="hero">
          <Wrap>
            <div className="menu-frame px-6 py-14 text-center sm:px-14 md:py-20" data-reveal>
              <Ribbon>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Ribbon>
              <Fleuron className="mt-6" />
              <h1 className={`${DISPLAY} mt-6 text-[clamp(3rem,9vw,6.6rem)] leading-[0.95] font-normal tracking-[-0.02em] ${WINE}`}>{content.businessName}</h1>
              <p className={`${DISPLAY} mx-auto mt-5 max-w-xl text-[clamp(1.3rem,2.4vw,1.8rem)] leading-snug italic`}>{content.tagline}</p>
              <p className={`mx-auto mt-6 max-w-lg text-[16.5px] leading-[1.8] ${SOFT}`}>{content.intro}</p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button href={cta} solid>
                  {chrome.cta}
                </Button>
                <Button href="#menu">Read the menu</Button>
              </div>
              {content.rating !== undefined && (
                <p className={`mt-10 text-[13px] tracking-[0.2em] uppercase ${SOFT}`}>
                  <span className={`${DISPLAY} mr-2 text-[24px] tracking-normal normal-case italic ${WINE}`}>{content.rating.toFixed(1)}</span>
                  {chrome.ratingLabel}
                  {content.reviewCount ? ` · ${formatCount(content.reviewCount)} ${chrome.reviewsLabel}` : ""}
                </p>
              )}
            </div>
          </Wrap>
        </section>

        <section className="scroll-mt-20 py-14 md:py-20" id="menu" data-section="services">
          <Wrap>
            <div className="text-center" data-reveal>
              <Ribbon>{chrome.servicesKicker}</Ribbon>
              <h2 className={`${DISPLAY} mt-4 text-[clamp(2.2rem,4.8vw,3.6rem)] leading-[1.05] font-normal`}>
                {chrome.servicesTitle} <em className={`italic ${WINE}`}>{chrome.servicesEm}</em>
              </h2>
              {note && <p className={`mx-auto mt-4 max-w-xl text-[15px] leading-relaxed italic ${SOFT}`}>{note}</p>}
              <Fleuron className="mt-8" />
            </div>
            <ul className="mx-auto mt-10 grid max-w-4xl gap-x-14 gap-y-9 md:grid-cols-2">
              {content.services.map((service, i) => (
                <li key={service.title} data-reveal style={revealDelay((i % 2) * 90)}>
                  <div className="flex items-baseline gap-3">
                    <h3 className={`${DISPLAY} text-[23px] leading-tight font-normal`}>{service.title}</h3>
                    <span aria-hidden className="menu-leader min-w-6 flex-1" />
                    <span aria-hidden className={`text-[14px] ${WINE}`}>✦</span>
                  </div>
                  <p className={`mt-1.5 text-[15.5px] leading-relaxed italic ${SOFT}`}>{service.description}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-20 bg-[#7a2020] py-16 text-[#f7f1e3] md:py-24" id="reserve" data-section="visit">
          <Wrap>
            <div className="text-center" data-reveal>
              <p className="text-[12px] tracking-[0.34em] text-[#f1c98d] uppercase">{chrome.visitKicker}</p>
              <h2 className={`${DISPLAY} mx-auto mt-4 max-w-2xl text-[clamp(2.1rem,4.4vw,3.4rem)] leading-[1.06] font-normal`}>{chrome.visitTitle}</h2>
            </div>
            <ol className="mt-12 grid gap-10 text-center md:grid-cols-3 md:gap-6">
              {steps.map((step, i) => (
                <li key={step.title} data-reveal style={revealDelay(i * 110)}>
                  <p className={`${DISPLAY} text-[46px] leading-none italic text-[#f1c98d]`}>{["i", "ii", "iii"][i]}</p>
                  <h3 className={`${DISPLAY} mt-3 text-[24px] font-normal`}>{step.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-[15.5px] leading-relaxed text-[#f7f1e3]/80">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12 text-center" data-reveal>
              <a
                href={cta}
                {...externalProps(cta)}
                className="inline-flex min-h-12 items-center justify-center bg-[#f7f1e3] px-8 text-[13px] tracking-[0.2em] text-[#7a2020] uppercase transition-colors hover:bg-white"
              >
                {chrome.cta}
              </a>
            </div>
          </Wrap>
        </section>

        {hasFaq && (
          <section className="scroll-mt-20 py-16 md:py-24" id="good-to-know" data-section="faq">
            <Wrap className="max-w-[48rem]">
              <div className="text-center" data-reveal>
                <Ribbon>Good to know</Ribbon>
                <Fleuron className="mt-5" />
              </div>
              <dl className="mt-10 grid gap-8" data-reveal style={revealDelay(80)}>
                {content.faqs.map((faq) => (
                  <div key={faq.question} className="text-center">
                    <dt className={`${DISPLAY} text-[22px] leading-snug font-normal ${WINE}`}>{faq.question}</dt>
                    <dd className={`mx-auto mt-2 max-w-xl text-[16px] leading-relaxed italic ${SOFT}`}>{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-20 pb-16 md:pb-24" id="find-the-table" data-section="contact">
          <Wrap className="max-w-[76rem]">
            <div className="menu-frame grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
              <div data-reveal>
                <p className={`text-[12px] tracking-[0.34em] uppercase ${WINE}`}>{chrome.navVisit}</p>
                <h2 className={`${DISPLAY} mt-4 text-[clamp(2.1rem,4.2vw,3.2rem)] leading-[1.05] font-normal`}>
                  {chrome.closingTitle} <em className={`italic ${WINE}`}>{chrome.closingEm}</em>
                </h2>
                <dl className="mt-8 grid gap-5 text-[16px]">
                  {content.address && (
                    <div>
                      <dt className={`text-[11px] tracking-[0.3em] uppercase ${WINE}`}>Address</dt>
                      <dd className="mt-1 leading-relaxed">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className={`text-[11px] tracking-[0.3em] uppercase ${WINE}`}>Telephone</dt>
                      <dd className="mt-1">
                        {links.call ? (
                          <a href={links.call} className="underline decoration-[#7a2020]/40 underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className={`text-[11px] tracking-[0.3em] uppercase ${WINE}`}>Service</dt>
                    <dd className="mt-1 italic">Message or call to confirm today&apos;s opening hours</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <Button key={action.key} href={action.href} solid={i === 0}>
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className={`mt-8 text-[15px] italic ${SOFT}`}>{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <div data-reveal style={revealDelay(120)}>
                  <MapEmbed content={content} className="min-h-80 border border-[#7a2020]/20 lg:h-full" frameClassName="sepia-[.45] saturate-[.7]" />
                </div>
              ) : (
                <div aria-hidden className={`hidden place-items-center text-[120px] ${WINE} opacity-15 lg:grid`}>
                  ❦
                </div>
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t border-[#7a2020]/20 pb-24 lg:pb-0">
        <Wrap className={`flex flex-col items-center gap-3 py-10 text-center text-[13px] ${SOFT}`}>
          <a href="#top" className={`${DISPLAY} inline-flex min-h-11 items-center text-[24px] italic ${WINE}`}>
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
