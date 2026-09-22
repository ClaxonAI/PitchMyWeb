import "./coaching.css";
import { RevealOnScroll } from "../dental-clinic/Reveal";
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

// sachu45 "coaching" (academy) design on scrape facts. Course fees, durations,
// pass statistics and student quotes are not shown: programmes are the
// service list, the numbers are rating/reviews/programmes, and the results
// block is the real Google rating plus the FAQ.

export function CoachingStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#apply");
  const facts = studioFacts(content, { listed: "Programmes listed", typical: "Common programmes" });
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const rating = ratingLine(content);
  const note = servicesNote(content, chrome);
  const hasResults = content.faqs.length > 0 || Boolean(rating);

  return (
    <div className="academy-shell" id="top">
      <a className="academy-skip" href="#academy-content">
        Skip to content
      </a>
      <aside className="academy-rail" aria-label="Primary navigation">
        <a className="academy-mark" href="#top">
          {content.businessName}
        </a>
        <nav aria-label="Sections">
          <a href="#programs">Programmes</a>
          <a href="#method">About</a>
          {hasResults && <a href="#results">Good to know</a>}
        </nav>
        <a className="academy-apply" href={cta} {...externalProps(cta)}>
          Enquire <span aria-hidden>↗</span>
        </a>
      </aside>

      <div className="academy-main">
        <ConceptRibbon name={content.businessName} tone={{ background: "#152028", color: "rgba(227,233,223,.75)", strong: "#f5f2ea", accent: "#f15335" }} />
        <header className="academy-mobile-nav">
          <a href="#top">{content.businessName}</a>
          <a href={cta} {...externalProps(cta)}>
            Enquire <span aria-hidden>↗</span>
          </a>
        </header>

        <main id="academy-content">
          <section className="academy-hero" data-section="hero">
            <p className="academy-kicker">{content.area ? `Admissions / ${content.area}` : "Admissions open"}</p>
            {/* Decorative; drawn from data-index so it is not read out or contrast-checked as text. */}
            <p className="academy-index" aria-hidden="true" data-index="01" />
            <h1 data-reveal>
              Learning is
              <br />
              <em>not</em> a race.
            </h1>
            <div className="academy-hero-note" data-reveal style={revealDelay(140)}>
              <span aria-hidden>Scroll to explore</span>
              <div>
                <p>{content.intro}</p>
                <a href={cta} {...externalProps(cta)}>
                  {chrome.cta} <span aria-hidden>↗</span>
                </a>
              </div>
            </div>
          </section>

          <section className="academy-manifesto" id="method" data-section="about">
            <p className="academy-section-label" data-reveal>
              {chrome.aboutKicker}
            </p>
            <p className="academy-statement" data-reveal style={revealDelay(80)}>
              Less noise. <span>More signal.</span> {content.tagline}.
            </p>
            <ul className="academy-numbers">
              {facts.map((fact, i) => (
                <li key={fact.label} data-reveal style={revealDelay(i * 90)}>
                  <strong>{fact.value}</strong>
                  <span>{fact.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="academy-programs" id="programs" data-section="services">
            <div className="academy-program-heading" data-reveal>
              <p className="academy-section-label">{chrome.servicesKicker}</p>
              <div>
                <h2>
                  Programmes built around <em>progress.</em>
                </h2>
                {note && <p className="academy-program-note">{note}</p>}
              </div>
            </div>
            <ol className="academy-course-list">
              {content.services.map((service, i) => (
                <li key={service.title} className="academy-course" data-reveal style={revealDelay((i % 4) * 70)}>
                  <span>{pad(i)}</span>
                  <div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                  </div>
                  <p className="academy-course-meta">
                    Ask about
                    <br />
                    <b>batches &amp; fees</b>
                  </p>
                  <a href={cta} {...externalProps(cta)} aria-label={`Enquire about ${service.title}`}>
                    <span aria-hidden>↗</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <section className="academy-method-grid" data-section="visit">
            <div className="academy-method-intro" data-reveal>
              <p className="academy-section-label">{chrome.visitKicker}</p>
              <h2>
                Getting started
                <br />
                is <em>simple.</em>
              </h2>
              <p>{chrome.visitTitle}</p>
            </div>
            <ol className="academy-feature-grid">
              {steps.map((step, i) => (
                <li key={step.title} data-reveal style={revealDelay(i * 110)}>
                  <span>{pad(i)}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          {hasResults && (
            <section className="academy-results" id="results" data-section="faq">
              <p className="academy-section-label" data-reveal>
                Good to know
              </p>
              <div className="academy-results-grid">
                {rating && (
                  <article data-reveal>
                    <span>★</span>
                    <h3>{rating}.</h3>
                    <p>{chrome.ratingLabel}</p>
                  </article>
                )}
                {content.faqs.map((faq, i) => (
                  <article key={faq.question} data-reveal style={revealDelay((i + 1) * 90)}>
                    <span>{pad(i)}</span>
                    <h3>{faq.question}</h3>
                    <p>{faq.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section id="apply" className="academy-apply-area" data-section="contact">
            <div data-reveal>
              <p className="academy-section-label">Start here</p>
              <h2>
                Ask for a
                <br />
                trial class.
              </h2>
              {(content.address || content.phone) && (
                <address>
                  {content.address && <span>{content.address}</span>}
                  {content.phone && links.call && <a href={links.call}>{content.phone}</a>}
                </address>
              )}
            </div>
            <div className="academy-apply-links" data-reveal style={revealDelay(120)}>
              {actions.length > 0 ? (
                actions.map((action) => (
                  <a key={action.key} href={action.href} {...externalProps(action.href)}>
                    {action.label} <span aria-hidden>↗</span>
                  </a>
                ))
              ) : (
                <p className="academy-apply-empty">{noContactNote(content)}</p>
              )}
              <MapEmbed content={content} className="academy-map" />
            </div>
          </section>
        </main>

        <footer className="academy-footer">
          <a href="#top">{content.businessName}</a>
          <p>{conceptNotice(content, chrome)}</p>
        </footer>
      </div>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
