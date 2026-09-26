import "./dental.css";
import { RevealOnScroll } from "../dental-clinic/Reveal";
import { ServiceIcon } from "../dental-clinic/icons";
import {
  conceptNotice,
  contactActions,
  externalProps,
  noContactNote,
  pad,
  primaryHref,
  ratingLine,
  revealDelay,
  servicesNote,
  studioFacts,
  studioLinks,
  visitSteps,
  type StudioProps,
} from "./common";
import { ConceptRibbon, FloatingWhatsApp, MapEmbed } from "./parts";

// "Smile Studio": a bright, modern practice. Deep ocean ink on a cool white
// page, mint as the one accent, rounded glass cards and a soft abstract smile
// in the hero drawn in CSS/SVG — no stock photo, nothing about the clinic that
// discovery did not find. Numbers are only the Google rating, the review count
// and the length of the treatment list.

const INK = "#0c3b4a";

function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[76rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Button({ href, children, tone = "solid" }: { href: string; children: React.ReactNode; tone?: "solid" | "ghost" | "mint" }) {
  const styles = {
    solid: "bg-[#0c3b4a] text-white hover:bg-[#0a3140]",
    ghost: "border border-[#0c3b4a]/20 bg-white/70 text-[#0c3b4a] hover:border-[#0c3b4a]/50",
    mint: "bg-[#7fd8c9] text-[#07242d] hover:bg-[#95e2d5]",
  }[tone];
  return (
    <a
      href={href}
      {...externalProps(href)}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-semibold transition-colors ${styles}`}
    >
      {children}
    </a>
  );
}

function Kicker({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold tracking-[0.08em] uppercase ${light ? "bg-white/10 text-[#9fe7da]" : "bg-[#e3f5f1] text-[#0f6b5d]"}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${light ? "bg-[#7fd8c9]" : "bg-[#17a08a]"}`} />
      {children}
    </p>
  );
}

/** The hero artwork: a calm, abstract smile on layered discs. Decorative only. */
function SmileArt() {
  return (
    <div aria-hidden className="smile-art relative mx-auto aspect-square w-full max-w-[30rem]">
      <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_30%_25%,#ffffff,#dff4ef_55%,#bfe9e0)]" />
      <div className="smile-orbit absolute inset-0 rounded-full border border-dashed border-[#0c3b4a]/15" />
      <svg viewBox="0 0 200 200" className="absolute inset-[18%]">
        <defs>
          <linearGradient id="smile-tooth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e6f3f1" />
          </linearGradient>
        </defs>
        <path
          d="M100 38c-14-10-40-12-52 4-12 16-6 42 2 62 7 18 9 42 20 56 8 10 16 4 19-10 3-13 5-26 11-26s8 13 11 26c3 14 11 20 19 10 11-14 13-38 20-56 8-20 14-46 2-62-12-16-38-14-52-4z"
          fill="url(#smile-tooth)"
          stroke={INK}
          strokeOpacity=".18"
          strokeWidth="2"
        />
        <path d="M64 58c-6 10-7 24-3 36" stroke="#7fd8c9" strokeWidth="5" strokeLinecap="round" fill="none" />
      </svg>
      <span className="smile-spark absolute top-[14%] right-[16%] size-3 rounded-full bg-[#7fd8c9]" />
      <span className="smile-spark absolute bottom-[18%] left-[12%] size-2 rounded-full bg-[#0c3b4a]/30 [animation-delay:1.2s]" />
    </div>
  );
}

export function DentalStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#visit-us");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const rating = ratingLine(content);
  const note = servicesNote(content, chrome);
  const facts = studioFacts(content, { listed: "Treatments listed", typical: "Common treatments" });

  return (
    <div className="smile-studio min-h-dvh bg-[#f4f7f6] font-[family-name:var(--font-manrope)] text-[#0c3b4a] antialiased [overflow-wrap:break-word]" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#07242d", color: "rgba(255,255,255,.72)", strong: "#ffffff", accent: "#7fd8c9" }} />

      <header className="sticky top-0 z-40 border-b border-[#0c3b4a]/8 bg-[#f4f7f6]/90 backdrop-blur-md">
        <Wrap>
          <div className="flex h-[70px] items-center justify-between gap-4">
            <a href="#top" className="flex min-h-11 min-w-0 items-center gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#0c3b4a] text-[#7fd8c9]">
                <ServiceIcon icon="smile" className="size-5" />
              </span>
              <span className="truncate text-[17px] font-extrabold tracking-[-0.01em]">{content.businessName}</span>
            </a>
            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="flex items-center gap-1 rounded-2xl bg-white/80 p-1 text-[14px] font-semibold shadow-[0_1px_0_rgba(12,59,74,.06)]">
                {[
                  [chrome.navServices, "#treatments"],
                  [chrome.navVisit, "#how-it-works"],
                  ...(content.faqs.length > 0 ? [["Questions", "#faq"]] : []),
                  ["Visit", "#visit-us"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <a href={href} className="inline-flex min-h-10 items-center rounded-xl px-4 transition-colors hover:bg-[#e3f5f1]">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <a
              href={cta}
              {...externalProps(cta)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[#0c3b4a] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#0a3140]"
            >
              <span className="hidden sm:inline">{chrome.cta}</span>
              <span className="sm:hidden">Book</span>
            </a>
          </div>
        </Wrap>
      </header>

      <main>
        <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24" data-section="hero">
          <div aria-hidden className="absolute -top-40 -right-40 size-[36rem] rounded-full bg-[#dff4ef] blur-3xl" />
          <Wrap className="relative">
            <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
              <div data-reveal>
                <Kicker>{content.area ? `${chrome.noun} · ${content.area}` : chrome.noun}</Kicker>
                <h1 className="mt-6 text-[clamp(2.5rem,6vw,4.6rem)] leading-[1.02] font-extrabold tracking-[-0.035em]">
                  {content.businessName}
                  <span className="mt-3 block text-[#17a08a]">{content.tagline}</span>
                </h1>
                <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#0c3b4a]/75">{content.intro}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href={cta}>{chrome.cta}</Button>
                  <Button href="#treatments" tone="ghost">
                    Explore {chrome.navServices.toLowerCase()}
                  </Button>
                </div>
                {rating && (
                  <p className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[14px] shadow-[0_10px_30px_-18px_rgba(12,59,74,.45)]">
                    <span aria-hidden className="text-[18px] text-[#f2b544]">★</span>
                    <span className="font-semibold">{rating}</span>
                  </p>
                )}
              </div>
              <div data-reveal style={revealDelay(160)}>
                <SmileArt />
              </div>
            </div>
          </Wrap>
        </section>

        <section aria-label="At a glance" className="pb-4" data-section="facts">
          <Wrap>
            <dl className="grid gap-3 rounded-3xl bg-[#0c3b4a] p-3 text-white sm:grid-cols-3">
              {facts.map((fact, i) => (
                <div key={fact.label} className="rounded-2xl bg-white/5 px-6 py-5" data-reveal style={revealDelay(i * 90)}>
                  <dt className="text-[13px] font-semibold tracking-wide text-[#9fe7da] uppercase">{fact.label}</dt>
                  <dd className="mt-2 text-[2.4rem] leading-none font-extrabold tracking-[-0.03em]">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Wrap>
        </section>

        <section className="scroll-mt-24 py-16 md:py-24" id="treatments" data-section="services">
          <Wrap>
            <div className="max-w-2xl" data-reveal>
              <Kicker>{chrome.servicesKicker}</Kicker>
              <h2 className="mt-5 text-[clamp(2rem,4vw,3.1rem)] leading-[1.08] font-extrabold tracking-[-0.03em]">
                {chrome.servicesTitle} <span className="text-[#17a08a]">{chrome.servicesEm}</span>
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-[#0c3b4a]/70">{note ?? `The treatments ${content.businessName} lists.`}</p>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {content.services.map((service, i) => (
                <li
                  key={service.title}
                  className="group rounded-3xl border border-[#0c3b4a]/8 bg-white p-6 transition-shadow hover:shadow-[0_22px_50px_-30px_rgba(12,59,74,.55)]"
                  data-reveal
                  style={revealDelay((i % 3) * 90)}
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-12 place-items-center rounded-2xl bg-[#e3f5f1] text-[#0f6b5d] transition-colors group-hover:bg-[#0c3b4a] group-hover:text-[#7fd8c9]">
                      <ServiceIcon icon={service.icon} className="size-6" />
                    </span>
                    <span className="text-[13px] font-semibold text-[#0c3b4a]/35">{pad(i)}</span>
                  </div>
                  <h3 className="mt-6 text-[19px] font-bold tracking-[-0.01em]">{service.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#0c3b4a]/70">{service.description}</p>
                </li>
              ))}
            </ul>
          </Wrap>
        </section>

        <section className="scroll-mt-24 bg-[#07242d] py-16 text-white md:py-24" id="how-it-works" data-section="visit">
          <Wrap>
            <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-16">
              <div data-reveal>
                <Kicker light>{chrome.visitKicker}</Kicker>
                <h2 className="mt-5 text-[clamp(2rem,4vw,3.1rem)] leading-[1.08] font-extrabold tracking-[-0.03em]">{chrome.visitTitle}</h2>
                <div className="mt-8">
                  <Button href={cta} tone="mint">
                    {chrome.cta}
                  </Button>
                </div>
              </div>
              <ol className="relative grid gap-4">
                {steps.map((step, i) => (
                  <li key={step.title} className="relative flex gap-5 rounded-3xl bg-white/[0.06] p-6" data-reveal style={revealDelay(i * 110)}>
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#7fd8c9] text-[15px] font-extrabold text-[#07242d]">{i + 1}</span>
                    <div>
                      <h3 className="text-[19px] font-bold">{step.title}</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-white/70">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Wrap>
        </section>

        {content.faqs.length > 0 && (
          <section className="scroll-mt-24 py-16 md:py-24" id="faq" data-section="faq">
            <Wrap className="max-w-[52rem]">
              <div className="text-center" data-reveal>
                <Kicker>Questions</Kicker>
                <h2 className="mt-5 text-[clamp(2rem,4vw,3rem)] leading-[1.08] font-extrabold tracking-[-0.03em]">Before you book</h2>
              </div>
              <div className="mt-10 grid gap-3" data-reveal style={revealDelay(100)}>
                {content.faqs.map((faq, i) => (
                  <details key={faq.question} className="group rounded-2xl border border-[#0c3b4a]/8 bg-white px-6" open={i === 0}>
                    <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-[17px] font-bold">
                      {faq.question}
                      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e3f5f1] text-[#0f6b5d] transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="pb-6 text-[15.5px] leading-relaxed text-[#0c3b4a]/72">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </Wrap>
          </section>
        )}

        <section className="scroll-mt-24 pb-16 md:pb-24" id="visit-us" data-section="contact">
          <Wrap>
            <div className="grid overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_80px_-50px_rgba(12,59,74,.6)] lg:grid-cols-2">
              <div className="p-8 sm:p-12" data-reveal>
                <Kicker>Visit us</Kicker>
                <h2 className="mt-5 text-[clamp(1.9rem,3.6vw,2.8rem)] leading-[1.1] font-extrabold tracking-[-0.03em]">
                  {chrome.closingTitle} <span className="text-[#17a08a]">{chrome.closingEm}</span>
                </h2>
                <dl className="mt-8 grid gap-5 text-[15px]">
                  {content.address && (
                    <div>
                      <dt className="text-[12px] font-semibold tracking-[0.08em] text-[#0c3b4a]/50 uppercase">Address</dt>
                      <dd className="mt-1 leading-relaxed">{content.address}</dd>
                    </div>
                  )}
                  {content.phone && (
                    <div>
                      <dt className="text-[12px] font-semibold tracking-[0.08em] text-[#0c3b4a]/50 uppercase">Phone</dt>
                      <dd className="mt-1">
                        {links.call ? (
                          <a href={links.call} className="font-semibold underline decoration-[#7fd8c9] decoration-2 underline-offset-4">
                            {content.phone}
                          </a>
                        ) : (
                          content.phone
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[12px] font-semibold tracking-[0.08em] text-[#0c3b4a]/50 uppercase">Hours</dt>
                    <dd className="mt-1">Message or call to confirm today&apos;s hours</dd>
                  </div>
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {actions.map((action, i) => (
                      <Button key={action.key} href={action.href} tone={i === 0 ? "solid" : "ghost"}>
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-8 text-[15px] text-[#0c3b4a]/70">{noContactNote(content)}</p>
                )}
              </div>
              {content.mapsQuery ? (
                <MapEmbed content={content} className="min-h-80 bg-[#e3f5f1]" frameClassName="saturate-[.85]" />
              ) : (
                <div aria-hidden className="hidden min-h-80 bg-[radial-gradient(circle_at_50%_50%,#bfe9e0,#e3f5f1_60%)] lg:block" />
              )}
            </div>
          </Wrap>
        </section>
      </main>

      <footer className="border-t border-[#0c3b4a]/8 pb-24 lg:pb-0">
        <Wrap className="flex flex-col gap-3 py-8 text-[13px] text-[#0c3b4a]/60 sm:flex-row sm:items-center sm:justify-between">
          <a href="#top" className="inline-flex min-h-11 items-center self-start text-[16px] font-extrabold text-[#0c3b4a]">
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
