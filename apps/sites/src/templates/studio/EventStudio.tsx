import "./event.css";
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

// sachu45 "event" design on scrape facts. Package prices, event counts and
// client quotes are not shown: occasions are the service list, the stats are
// the real rating/review numbers, and "notes from the room" is the FAQ.

export function EventStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#enquire");
  const facts = studioFacts(content, { listed: "Occasions listed", typical: "Common occasions" });
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const rating = ratingLine(content);
  const note = servicesNote(content, chrome);
  const year = new Date(content.generatedAt).getFullYear();

  return (
    <div className="scene" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#100c0e", color: "rgba(240,222,208,.7)", strong: "#f0ded0", accent: "#c9a35c" }} />
      <header className="scene-nav">
        <a className="scene-logo" href="#top">
          <span>{content.businessName}</span>
          <i aria-hidden>.</i>
        </a>
        <nav aria-label="Sections">
          <a href="#occasions">{chrome.navServices}</a>
          <a href="#story">About</a>
          <a href="#enquire">{chrome.navVisit}</a>
        </nav>
        <a className="scene-menu" href={cta} {...externalProps(cta)}>
          Enquire <span aria-hidden>↗</span>
        </a>
      </header>

      <main>
        <section className="scene-hero" data-section="hero">
          <div className="scene-hero-copy" data-reveal>
            <p className="scene-eyebrow">{content.area ? `${chrome.noun} · ${content.area}` : "Weddings · celebrations · experiences"}</p>
            <h1>
              The feeling
              <br />
              stays <em>with you.</em>
            </h1>
            <p>{content.tagline}</p>
            <a className="scene-link" href="#occasions">
              Discover what they do <span aria-hidden>↓</span>
            </a>
          </div>
          <div className="scene-art" aria-hidden="true" data-reveal style={revealDelay(160)}>
            <span className="scene-orbit one" />
            <span className="scene-orbit two" />
            <span className="scene-orbit three" />
            <span className="scene-date">{year}</span>
            <span className="scene-dot" />
          </div>
          <p className="scene-side-copy" aria-hidden="true">
            Live well
            <br />
            together
          </p>
        </section>

        <section className="scene-intro" id="story" data-section="about">
          <div data-reveal>
            <p className="scene-eyebrow">{chrome.aboutKicker}</p>
            <h2>
              Plan less.
              <br />
              <em>Feel more.</em>
            </h2>
          </div>
          <p data-reveal style={revealDelay(100)}>
            {content.intro}
          </p>
          <ul className="scene-stats">
            {facts.map((fact, i) => (
              <li key={fact.label} data-reveal style={revealDelay(i * 90)}>
                <strong>{fact.value}</strong>
                <span>{fact.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="scene-occasions" id="occasions" data-section="services">
          <header data-reveal>
            <div>
              <p className="scene-eyebrow">{chrome.servicesKicker}</p>
              <h2>
                {chrome.servicesTitle} <em>{chrome.servicesEm}</em>
              </h2>
              {note && <p className="scene-occasions-note">{note}</p>}
            </div>
            <span aria-hidden>
              01 — {pad(content.services.length - 1)}
            </span>
          </header>
          <ol className="scene-occasion-list">
            {content.services.map((service, i) => (
              <li key={service.title} data-reveal style={revealDelay((i % 2) * 90)}>
                <span>{pad(i)}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a href={cta} {...externalProps(cta)} aria-label={`Enquire about ${service.title}`}>
                  Enquire <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="scene-process" data-section="visit">
          <div className="scene-process-title" data-reveal>
            <p className="scene-eyebrow">{chrome.visitKicker}</p>
            <h2>
              The magic is
              <br />
              in the <em>making.</em>
            </h2>
            <p>{chrome.visitTitle}</p>
          </div>
          <ol>
            {steps.map((step, i) => (
              <li key={step.title} data-reveal style={revealDelay(i * 110)}>
                <span>{pad(i)}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {(content.faqs.length > 0 || rating) && (
          <section className="scene-notes" data-section="faq">
            <p className="scene-eyebrow" data-reveal>
              Good to know
            </p>
            <div className="scene-notes-grid">
              {rating && (
                <article className="scene-note-rating" data-reveal>
                  <span aria-hidden>✦</span>
                  <h3>{rating}.</h3>
                  <p>{chrome.ratingLabel}</p>
                </article>
              )}
              {content.faqs.map((faq, i) => (
                <article key={faq.question} data-reveal style={revealDelay((i + 1) * 90)}>
                  <span aria-hidden>✦</span>
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="scene-enquiry" id="enquire" data-section="contact">
          <div data-reveal>
            <p className="scene-eyebrow">Your occasion starts here</p>
            <h2>
              Something
              <br />
              <em>worth keeping.</em>
            </h2>
            {(content.address || content.phone) && (
              <address>
                {content.address && <span>{content.address}</span>}
                {content.phone && links.call && <a href={links.call}>{content.phone}</a>}
              </address>
            )}
          </div>
          <div className="scene-cta-list" data-reveal style={revealDelay(120)}>
            {actions.length > 0 ? (
              actions.map((action) => (
                <a key={action.key} href={action.href} {...externalProps(action.href)}>
                  {action.label} <span aria-hidden>↗</span>
                </a>
              ))
            ) : (
              <p className="scene-cta-empty">{noContactNote(content)}</p>
            )}
            <MapEmbed content={content} className="scene-map" />
          </div>
        </section>
      </main>

      <footer className="scene-footer">
        <a href="#top">{content.businessName}</a>
        <p>{conceptNotice(content, chrome)}</p>
      </footer>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
