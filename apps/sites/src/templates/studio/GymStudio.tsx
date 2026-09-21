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
  studioFacts,
  studioLinks,
  visitSteps,
  type StudioProps,
} from "./common";
import { ConceptRibbon, FloatingWhatsApp, MapEmbed } from "./parts";

// sachu45 "gym" (HyperFit) design on scrape facts. Membership prices, trainer
// quotes and the readiness score are not shown: the meter carries the real
// Google rating, the stats are rating/reviews/programmes, the plans grid is
// the FAQ and the member voice is the rating itself.

export function GymStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#contact");
  const facts = studioFacts(content, { listed: "Programmes listed", typical: "Common programmes" });
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const note = servicesNote(content, chrome);
  const ticker = [content.tagline, `${chrome.servicesTitle} ${chrome.servicesEm}`, "Ask about an intro session"];

  return (
    <div className="training" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#1b1c1b", color: "rgba(244,244,238,.75)", strong: "#f4f4ee", accent: "#d7ff38", fontFamily: "var(--training-font)", fontSize: 14 }} />
      <header className="training-nav">
        <a href="#top" className="training-mark">
          <i aria-hidden>●</i>
          <span>{content.businessName}</span>
        </a>
        <nav aria-label="Sections">
          <a href="#about">
            <span>01</span>About
          </a>
          <a href="#services">
            <span>02</span>
            {chrome.navServices}
          </a>
          <a href="#contact">
            <span>03</span>Contact
          </a>
        </nav>
        <a className="training-contact" href={cta} {...externalProps(cta)}>
          Start training <b aria-hidden>↗</b>
        </a>
      </header>

      <main>
        <section className="training-hero" data-section="hero">
          <div className="training-grid" aria-hidden="true" />
          <div className="training-hero-copy" data-reveal>
            <p className="training-kicker">Training studio{content.area ? ` / ${content.area}` : ""}</p>
            <h1>
              Built to
              <br />
              <em>perform.</em>
            </h1>
            <div className="training-hero-lead">
              <span aria-hidden>01</span>
              <p>{content.intro}</p>
            </div>
            <a className="training-hero-link" href="#services">
              See what&apos;s on <b aria-hidden>→</b>
            </a>
          </div>
          {content.rating !== undefined && (
            <div className="training-meter" data-reveal style={revealDelay(160)}>
              <strong>
                <span aria-hidden>★ </span>
                {content.rating.toFixed(1)}
              </strong>
              <span>
                {content.reviewCount ? "Google reviews" : "Rated on Google"}
                <b>{content.reviewCount ? formatCount(content.reviewCount) : "out of 5"}</b>
              </span>
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} aria-hidden="true" />
              ))}
            </div>
          )}
        </section>

        <div className="training-ticker" role="note" aria-label={ticker.join(". ")}>
          <div className="training-ticker-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <ul key={copy}>
                {ticker.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <section className="training-data" id="about" data-section="about">
          <header data-reveal>
            <p className="training-kicker">{chrome.aboutKicker}</p>
            <h2>
              Progress needs
              <br />a <em>system.</em>
            </h2>
          </header>
          <ul className="training-stats">
            {facts.map((fact, i) => (
              <li key={fact.label} data-reveal style={revealDelay(i * 90)}>
                <span>{pad(i)}</span>
                <strong>{fact.value}</strong>
                <p>{fact.label}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="training-programs" id="services" data-section="services">
          <div data-reveal>
            <p className="training-kicker">{chrome.servicesKicker}</p>
            <h2>
              Choose
              <br />
              your <em>work.</em>
            </h2>
            {note && <p className="training-programs-note">{note}</p>}
          </div>
          <ol className="training-program-list">
            {content.services.map((service, i) => (
              <li key={service.title} data-reveal style={revealDelay((i % 4) * 70)}>
                <span>{pad(i)}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a href={cta} {...externalProps(cta)} aria-label={`Ask about ${service.title}`}>
                  Ask about it <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="training-path" data-section="visit">
          <header data-reveal>
            <p className="training-kicker">{chrome.visitKicker}</p>
            <h2>
              Three steps
              <br />
              to <em>your rhythm.</em>
            </h2>
          </header>
          <ol className="training-steps">
            {steps.map((step, i) => (
              <li key={step.title} data-reveal style={revealDelay(i * 110)}>
                <span>{pad(i)}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {content.faqs.length > 0 && (
          <section className="training-faq" data-section="faq">
            <header data-reveal>
              <p className="training-kicker">Before you start</p>
              <h2>
                Good to
                <br />
                <em>know.</em>
              </h2>
            </header>
            <div className="training-faq-grid">
              {content.faqs.map((faq, i) => (
                <article key={faq.question} data-reveal style={revealDelay(i * 90)}>
                  <span>{pad(i)}</span>
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {content.rating !== undefined && (
          <section className="training-voice" data-section="rating">
            <div data-reveal>
              <p className="training-kicker">{chrome.ratingLabel}</p>
              <blockquote>
                {content.rating.toFixed(1)} out of 5{content.reviewCount ? `, from ${formatCount(content.reviewCount)} reviews` : ""}.
              </blockquote>
              <p className="training-voice-source">Google reviews</p>
            </div>
          </section>
        )}

        <section className="training-contact-section" id="contact" data-section="contact">
          <div data-reveal>
            <p className="training-kicker">Make a first move</p>
            <h2>
              Ready when
              <br />
              you <em>are.</em>
            </h2>
            {(content.address || content.phone) && (
              <address>
                {content.address && <span>{content.address}</span>}
                {content.phone && links.call && (
                  <a href={links.call} className="training-phone">
                    {content.phone}
                  </a>
                )}
              </address>
            )}
          </div>
          <div data-reveal style={revealDelay(120)}>
            <div className="training-cta-list">
              {actions.length > 0 ? (
                actions.map((action) => (
                  <a key={action.key} href={action.href} {...externalProps(action.href)}>
                    {action.label} <span aria-hidden>↗</span>
                  </a>
                ))
              ) : (
                <p className="training-cta-empty">{noContactNote(content)}</p>
              )}
            </div>
            <MapEmbed content={content} className="training-map" />
          </div>
        </section>
      </main>

      <footer className="training-footer">
        <strong>{content.businessName}</strong>
        <p>{conceptNotice(content, chrome)}</p>
        <a href="#top">Back to top ↑</a>
      </footer>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
