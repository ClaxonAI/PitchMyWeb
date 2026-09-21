import type { DentalContent } from "@pitchmyweb/templates";
import { getPreviewChrome } from "@pitchmyweb/templates";
import {
  ArrowIcon,
  BrandMark,
  ClockIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  ServiceIcon,
  StarIcon,
  WhatsAppIcon,
} from "./icons";
import { RevealOnScroll } from "./Reveal";

// Preview site: every section renders only from scrape facts in `content`.
// Vertical chrome (restaurant, salon, gym, …) changes labels and colour,
// not invented testimonials or staff.

type Props = { content: DentalContent };
type Chrome = ReturnType<typeof getPreviewChrome>;

type Links = { whatsapp: string | null; call: string | null; maps: string | null };

function buildLinks(content: DentalContent, chrome: Chrome): Links {
  const greeting = `Hi ${content.businessName}, ${chrome.greeting}`;
  return {
    whatsapp: content.phoneDigits ? `https://wa.me/${content.phoneDigits}?text=${encodeURIComponent(greeting)}` : null,
    call: content.phoneDigits ? `tel:+${content.phoneDigits}` : null,
    maps: content.mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(content.mapsQuery)}` : null,
  };
}

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Kicker({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "light" }) {
  return (
    <p className={`kicker flex items-center gap-2.5 ${tone === "light" ? "text-white/70" : "text-brand"}`}>
      <span className={`h-px w-6 ${tone === "light" ? "bg-white/40" : "bg-brand/50"}`} />
      {children}
    </p>
  );
}

function PrimaryButton({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex h-13 items-center justify-center gap-2.5 rounded-full bg-brand px-6 text-[15px] font-semibold text-white shadow-[0_12px_30px_-12px_var(--site-brand)] transition hover:bg-brand-deep active:scale-[.98] ${className}`}
    >
      {children}
    </a>
  );
}

function GhostButton({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={`inline-flex h-13 items-center justify-center gap-2.5 rounded-full border border-ink/15 bg-paper/60 px-6 text-[15px] font-semibold text-ink transition hover:border-brand/40 hover:text-brand ${className}`}
    >
      {children}
    </a>
  );
}

function PreviewRibbon({ name }: { name: string }) {
  return (
    <div className="bg-ink text-white">
      <Container className="flex items-center justify-center gap-2 py-2 text-center text-[11.5px] tracking-wide text-white/75">
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span>
          Website concept prepared for <span className="font-semibold text-white">{name}</span> · preview
        </span>
      </Container>
    </div>
  );
}

function Header({ content, links, chrome }: { content: DentalContent; links: Links; chrome: Chrome }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-page/95 lg:bg-page/85 lg:backdrop-blur-xl">
      <Container className="flex h-[68px] items-center justify-between gap-4">
        <a href="#top" className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white">
            <BrandMark mark={chrome.mark} className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="display block truncate text-[21px] leading-none">{content.businessName}</span>
            {content.area && <span className="mt-1 block truncate text-[11px] tracking-wide text-muted">{chrome.noun} · {content.area}</span>}
          </span>
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-[14px] text-muted lg:flex">
          <a href="#treatments" className="transition hover:text-ink">{chrome.navServices}</a>
          <a href="#visit" className="transition hover:text-ink">{chrome.navVisit}</a>
          {content.address && <a href="#location" className="transition hover:text-ink">Location</a>}
          <a href="#faq" className="transition hover:text-ink">FAQ</a>
        </nav>
        {links.whatsapp && (
          <a
            href={links.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-brand px-4 text-[13px] font-semibold text-white transition hover:bg-brand-deep"
          >
            <WhatsAppIcon className="size-4" />
            <span className="hidden sm:inline">{chrome.cta}</span>
            <span className="sm:hidden">Book</span>
          </a>
        )}
      </Container>
    </header>
  );
}

function Headline({ content }: { content: DentalContent }) {
  const suffix = content.area ? ` in ${content.area}` : "";
  if (suffix && content.tagline.endsWith(suffix)) {
    return (
      <>
        {content.tagline.slice(0, -suffix.length)}
        <em className="text-brand">{suffix}</em>
      </>
    );
  }
  return <>{content.tagline}</>;
}

function HeroArt({ content, chrome }: { content: DentalContent; chrome: Chrome }) {
  return (
    <div data-reveal style={{ ["--reveal-delay" as string]: "120ms" }} className="relative mx-auto w-full max-w-[460px] lg:max-w-none">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2.75rem] bg-brand">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgb(255_255_255/.22),transparent_60%)]" />
        <svg viewBox="0 0 400 500" className="absolute inset-0 size-full" aria-hidden preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="white" strokeOpacity=".14">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <path key={i} d={`M${60 + i * 28} 520 V${250 - i * 4} a${140 - i * 28} ${140 - i * 28} 0 0 1 ${280 - i * 56} 0 V520`} strokeWidth="1.2" />
            ))}
          </g>
          <circle cx="292" cy="118" r="46" fill="var(--site-accent)" />
          <circle cx="292" cy="118" r="70" fill="var(--site-accent)" fillOpacity=".12" />
        </svg>
        <div className="grain absolute inset-0 opacity-60 mix-blend-overlay" />
        <BrandMark mark={chrome.mark} className="absolute bottom-[18%] left-1/2 size-44 -translate-x-1/2 text-white/90 [stroke-width:.9]" />

        {typeof content.rating === "number" && (
          <div className="animate-float absolute bottom-6 left-5 rounded-2xl bg-paper/95 p-4 shadow-float backdrop-blur sm:left-6">
            <div className="flex items-center gap-1 text-accent">
              {[0, 1, 2, 3, 4].map((i) => (
                <StarIcon key={i} className={`size-3.5 ${i < Math.round(content.rating!) ? "" : "opacity-25"}`} />
              ))}
            </div>
            <p className="mt-1.5 text-[22px] leading-none font-semibold text-ink">
              {content.rating.toFixed(1)}
              <span className="ml-1 text-[12px] font-medium text-muted">on Google</span>
            </p>
            {content.reviewCount !== undefined && (
              <p className="mt-1 text-[12px] text-muted">{content.reviewCount.toLocaleString("en-IN")} {chrome.reviewsLabel}</p>
            )}
          </div>
        )}

        {content.area && (
          <div className="absolute top-6 right-5 flex items-center gap-2 rounded-full bg-paper/95 py-2 pr-4 pl-2.5 text-[12.5px] font-medium text-ink shadow-float sm:right-6">
            <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-brand">
              <PinIcon className="size-3.5" />
            </span>
            {content.area}
          </div>
        )}
      </div>
    </div>
  );
}

function Hero({ content, links, chrome }: { content: DentalContent; links: Links; chrome: Chrome }) {
  return (
    <section id="top" data-section="hero" className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-40 -left-40 size-[520px] rounded-full bg-brand-soft/70 blur-3xl" />
      <Container className="relative grid items-center gap-12 pt-10 pb-16 sm:pt-14 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:pt-20 lg:pb-24">
        {/* min-w-0 + break-words: a long place name (e.g. Thiruvananthapuram) must wrap, not widen the grid past a 320px screen. */}
        <div data-reveal className="min-w-0">
          <Kicker>{chrome.noun}{content.area ? ` · ${content.area}` : ""}</Kicker>
          <h1 className="display mt-6 text-[clamp(2.25rem,11vw,2.75rem)] leading-[1.02] break-words sm:text-6xl lg:text-[76px]">
            <Headline content={content} />
          </h1>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-muted sm:text-lg">{content.intro}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            {links.whatsapp && (
              <PrimaryButton href={links.whatsapp}>
                <WhatsAppIcon className="size-5" />
                {chrome.cta}
                <ArrowIcon className="size-4 transition group-hover:translate-x-0.5" />
              </PrimaryButton>
            )}
            {links.call && content.phone && (
              <GhostButton href={links.call}>
                <PhoneIcon className="size-4.5" />
                Call {content.phone}
              </GhostButton>
            )}
          </div>
        </div>
        <HeroArt content={content} chrome={chrome} />
      </Container>
    </section>
  );
}

function Facts({ content, chrome }: { content: DentalContent; chrome: Chrome }) {
  const facts: { value: string; label: string }[] = [];
  if (typeof content.rating === "number") facts.push({ value: `${content.rating.toFixed(1)} ★`, label: "Google rating" });
  if (content.reviewCount !== undefined) facts.push({ value: content.reviewCount.toLocaleString("en-IN"), label: "Google reviews" });
  facts.push({ value: `${content.services.length}`, label: content.servicesAreGeneric ? `Common ${chrome.navServices.toLowerCase()}` : chrome.navServices });
  if (content.phoneDigits) facts.push({ value: "WhatsApp", label: "Booking by message" });
  if (facts.length < 2) return null;

  return (
    <section data-section="facts" aria-label="At a glance" className="border-y border-line bg-paper">
      <Container>
        <dl className={`grid grid-cols-2 divide-line sm:divide-x ${facts.length >= 4 ? "lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          {facts.map((fact, i) => (
            <div key={fact.label} data-reveal style={{ ["--reveal-delay" as string]: `${i * 80}ms` }} className="px-2 py-7 sm:px-8">
              <dt className="text-[12.5px] text-muted">{fact.label}</dt>
              <dd className="display mt-1 text-[34px] leading-none text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Services({ content, chrome }: { content: DentalContent; chrome: Chrome }) {
  return (
    <section id="treatments" data-section="services" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <div data-reveal className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Kicker>{chrome.servicesKicker}</Kicker>
            <h2 className="display mt-5 max-w-xl text-[40px] leading-[1.04] sm:text-5xl">
              {chrome.servicesTitle} <em className="text-brand">{chrome.servicesEm}</em>
            </h2>
          </div>
          {content.servicesAreGeneric && (
            <p className="max-w-xs text-[13px] leading-relaxed text-muted">
              Common {chrome.noun.toLowerCase()} offerings. Please confirm what {content.businessName} offers when you book.
            </p>
          )}
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.services.map((service, i) => (
            <li
              key={service.title}
              data-reveal
              style={{ ["--reveal-delay" as string]: `${(i % 3) * 90}ms` }}
              className="group relative overflow-hidden rounded-soft border border-line bg-paper p-7 transition duration-500 hover:-translate-y-1 hover:border-brand/30 hover:shadow-float"
            >
              <div className="flex items-start justify-between">
                <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand transition duration-500 group-hover:bg-brand group-hover:text-white">
                  <ServiceIcon icon={service.icon} className="size-7" />
                </span>
                {/* Decorative index, drawn by CSS so it is not read out or contrast-checked as text. */}
                <span aria-hidden data-index={String(i + 1).padStart(2, "0")} className="display text-2xl text-line transition group-hover:text-accent before:content-[attr(data-index)]" />
              </div>
              <h3 className="mt-8 text-[19px] font-semibold tracking-tight">{service.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{service.description}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Visit({ content, links, chrome }: { content: DentalContent; links: Links; chrome: Chrome }) {
  const steps = chrome.visitSteps.map((step, i) => ({
    title: step.title,
    body:
      i === 0 && links.whatsapp
        ? `Tap the WhatsApp button and tell ${content.businessName} what you need.`
        : step.body(content.businessName, content.address),
  }));
  return (
    <section id="visit" data-section="visit" className="scroll-mt-20 bg-paper py-20 sm:py-28">
      <Container>
        <div data-reveal className="max-w-2xl">
          <Kicker>{chrome.visitKicker}</Kicker>
          <h2 className="display mt-5 text-[40px] leading-[1.04] sm:text-5xl">{chrome.visitTitle}</h2>
        </div>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step, i) => (
            <li key={step.title} data-reveal style={{ ["--reveal-delay" as string]: `${i * 110}ms` }} className="relative border-t border-line pt-8">
              <span className="display absolute -top-[0.62em] left-0 bg-paper pr-4 text-[56px] leading-none text-accent">{i + 1}</span>
              <h3 className="mt-6 text-[20px] font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function About({ content, chrome }: { content: DentalContent; chrome: Chrome }) {
  return (
    <section data-section="about" className="relative overflow-hidden bg-brand-deep py-20 text-white sm:py-28">
      <div aria-hidden className="grain absolute inset-0 opacity-50 mix-blend-overlay" />
      <div aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full border border-white/10" />
      <div aria-hidden className="absolute -right-8 -bottom-8 size-64 rounded-full border border-white/10" />
      <Container className="relative grid gap-12 lg:grid-cols-[1.4fr_.6fr] lg:items-end">
        <div data-reveal>
          <Kicker tone="light">{chrome.aboutKicker}</Kicker>
          <p className="display mt-7 text-[32px] leading-[1.18] sm:text-[42px]">
            <span className="text-accent">“</span>
            {content.intro}
            <span className="text-accent">”</span>
          </p>
          <p className="mt-8 text-[14px] text-white/60">{content.businessName}{content.area ? ` · ${content.area}` : ""}</p>
        </div>
        {typeof content.rating === "number" && (
          <div data-reveal style={{ ["--reveal-delay" as string]: "150ms" }} className="rounded-soft border border-white/15 bg-white/5 p-7 backdrop-blur">
            <p className="text-[13px] text-white/60">{chrome.ratingLabel}</p>
            <p className="display mt-2 text-[72px] leading-none">{content.rating.toFixed(1)}</p>
            <div className="mt-3 flex gap-1 text-accent">
              {[0, 1, 2, 3, 4].map((i) => (
                <StarIcon key={i} className={`size-4 ${i < Math.round(content.rating!) ? "" : "opacity-25"}`} />
              ))}
            </div>
            {content.reviewCount !== undefined && (
              <p className="mt-4 text-[13px] text-white/60">Based on {content.reviewCount.toLocaleString("en-IN")} reviews</p>
            )}
          </div>
        )}
      </Container>
    </section>
  );
}

function Location({ content, links }: { content: DentalContent; links: Links }) {
  if (!content.address && !content.phone) return null;
  const embed = content.mapsQuery ? `https://maps.google.com/maps?q=${encodeURIComponent(content.mapsQuery)}&z=15&output=embed` : null;
  return (
    <section id="location" data-section="location" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-16">
        <div data-reveal>
          <Kicker>Find us</Kicker>
          <h2 className="display mt-5 text-[40px] leading-[1.04] sm:text-5xl">Easy to reach, easy to book.</h2>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {content.address && (
              <li className="flex gap-4 py-5">
                <PinIcon className="mt-0.5 size-5 shrink-0 text-brand" />
                <div>
                  <p className="text-[12.5px] text-muted">Address</p>
                  <p className="mt-1 text-[16px] leading-relaxed">{content.address}</p>
                  {links.maps && (
                    <a href={links.maps} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline">
                      Get directions <ArrowIcon className="size-3.5" />
                    </a>
                  )}
                </div>
              </li>
            )}
            {content.phone && links.call && (
              <li className="flex gap-4 py-5">
                <PhoneIcon className="mt-0.5 size-5 shrink-0 text-brand" />
                <div>
                  <p className="text-[12.5px] text-muted">Phone & WhatsApp</p>
                  <a href={links.call} className="flex min-h-11 items-center text-[16px] hover:text-brand">
                    {content.phone}
                  </a>
                </div>
              </li>
            )}
            <li className="flex gap-4 py-5">
              <ClockIcon className="mt-0.5 size-5 shrink-0 text-brand" />
              <div>
                <p className="text-[12.5px] text-muted">Opening hours</p>
                <p className="mt-1 text-[16px]">Message or call to confirm today&apos;s hours</p>
              </div>
            </li>
          </ul>
        </div>
        {embed && (
          <div data-reveal style={{ ["--reveal-delay" as string]: "120ms" }} className="relative min-h-[320px] overflow-hidden rounded-[2.25rem] border border-line bg-brand-soft lg:min-h-full">
            <iframe
              title={`Map showing ${content.businessName}`}
              src={embed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 size-full grayscale-[35%] contrast-[1.05]"
            />
          </div>
        )}
      </Container>
    </section>
  );
}

function Faq({ content }: { content: DentalContent }) {
  if (content.faqs.length === 0) return null;
  return (
    <section id="faq" data-section="faq" className="scroll-mt-20 bg-paper py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
        <div data-reveal>
          <Kicker>Questions</Kicker>
          <h2 className="display mt-5 text-[40px] leading-[1.04] sm:text-5xl">Good to know before you come in.</h2>
        </div>
        <div data-reveal style={{ ["--reveal-delay" as string]: "100ms" }} className="divide-y divide-line border-y border-line">
          {content.faqs.map((faq, i) => (
            <details key={faq.question} className="group py-1" open={i === 0}>
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 text-[17px] font-semibold tracking-tight transition hover:text-brand">
                {faq.question}
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line transition duration-300 group-open:rotate-45 group-open:border-brand group-open:bg-brand group-open:text-white">
                  <PlusIcon className="size-4" />
                </span>
              </summary>
              <p className="max-w-xl pr-12 pb-6 text-[15.5px] leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Closing({ content, links, chrome }: { content: DentalContent; links: Links; chrome: Chrome }) {
  return (
    <section data-section="cta" className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div data-reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-brand px-7 py-16 text-center text-white sm:px-14 sm:py-24">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_0%,rgb(255_255_255/.18),transparent_65%)]" />
        <div aria-hidden className="grain absolute inset-0 opacity-50 mix-blend-overlay" />
        <div className="relative">
          <BrandMark mark={chrome.mark} className="mx-auto size-12 text-white/80" />
          <h2 className="display mx-auto mt-6 max-w-2xl text-[40px] leading-[1.04] sm:text-6xl">
            {chrome.closingTitle} <em className="text-accent">{chrome.closingEm}</em>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[16px] text-white/70">
            Reach {content.businessName} directly. No apps, no forms.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            {links.whatsapp && (
              <a
                href={links.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-13 items-center justify-center gap-2.5 rounded-full bg-white px-7 text-[15px] font-semibold text-brand-deep transition hover:bg-page"
              >
                <WhatsAppIcon className="size-5 text-whatsapp" />
                {chrome.cta}
              </a>
            )}
            {links.call && (
              <a
                href={links.call}
                className="inline-flex h-13 items-center justify-center gap-2.5 rounded-full border border-white/30 px-7 text-[15px] font-semibold text-white transition hover:bg-white/10"
              >
                <PhoneIcon className="size-4.5" />
                {chrome.callCta}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ content, chrome }: { content: DentalContent; chrome: Chrome }) {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-brand text-white">
              <BrandMark mark={chrome.mark} className="size-4.5" />
            </span>
            <span className="display text-[22px]">{content.businessName}</span>
          </div>
          {content.address && <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-muted">{content.address}</p>}
        </div>
        <p className="max-w-sm text-[12px] leading-relaxed text-muted sm:text-right">
          This is a website concept prepared for {content.businessName}. It is a preview, not the {chrome.footerKind}&apos;s official website.
        </p>
      </Container>
    </footer>
  );
}

function FloatingWhatsApp({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="fixed right-4 bottom-4 z-50 grid size-14 place-items-center rounded-full bg-whatsapp text-white shadow-float lg:hidden"
    >
      <span aria-hidden className="animate-pulse-ring absolute inset-0 rounded-full bg-whatsapp" />
      <WhatsAppIcon className="relative size-7" />
    </a>
  );
}

export function DentalClinicSite({ content }: Props) {
  const chrome = getPreviewChrome(content.template);
  const links = buildLinks(content, chrome);
  return (
    <div data-theme={content.theme} className="min-h-dvh bg-page text-ink">
      <PreviewRibbon name={content.businessName} />
      <Header content={content} links={links} chrome={chrome} />
      <main>
        <Hero content={content} links={links} chrome={chrome} />
        <Facts content={content} chrome={chrome} />
        <Services content={content} chrome={chrome} />
        <Visit content={content} links={links} chrome={chrome} />
        <About content={content} chrome={chrome} />
        <Location content={content} links={links} />
        <Faq content={content} />
        <Closing content={content} links={links} chrome={chrome} />
      </main>
      <Footer content={content} chrome={chrome} />
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
