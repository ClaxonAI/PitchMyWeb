import "./salon.css";
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
  studioLinks,
  visitSteps,
  type StudioProps,
} from "./common";
import { ConceptRibbon, FloatingWhatsApp, MapEmbed } from "./parts";

// sachu45 "salon" design on scrape facts. Treatment prices, opening hours,
// lookbook photos and client notes are not shown: the treatment edit is the
// service list, the lookbook tiles carry the visit steps, and "words from the
// chair" is the real Google rating plus the FAQ.

export function SalonStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#book");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const rating = ratingLine(content);
  const note = servicesNote(content, chrome);

  return (
    <div className="salon" id="top">
      <a className="salon-skip" href="#salon-main">
        Skip to content
      </a>
      <ConceptRibbon name={content.businessName} tone={{ background: "#17151c", color: "rgba(247,245,239,.72)", strong: "#f7f5ef", accent: "#d8ff4f" }} />
      <header className="salon-nav">
        <a className="salon-mark" href="#top">
          <span>{content.businessName}</span>
          <i>{chrome.noun}</i>
        </a>
        <nav aria-label="Sections">
          <a href="#menu">{chrome.navServices}</a>
          <a href="#story">About</a>
          <a href="#visit">{chrome.navVisit}</a>
        </nav>
        <a className="salon-book" href={cta} {...externalProps(cta)}>
          Book a chair <span aria-hidden>↘</span>
        </a>
      </header>

      <main id="salon-main">
        <section className="salon-hero" data-section="hero">
          <div className="salon-hero-copy" data-reveal>
            <p className="salon-kicker">{content.area ? `${content.area} / appointments` : "By appointment"}</p>
            <h1>
              Made for
              <br />
              <em>your mirror.</em>
            </h1>
            <p>{content.intro}</p>
            <a href="#menu">
              See the {chrome.navServices.toLowerCase()} <b aria-hidden>↓</b>
            </a>
          </div>
          <div className="salon-portrait" aria-hidden="true" data-reveal style={revealDelay(160)}>
            <span>01</span>
            <div className="salon-face">
              <i />
              <b />
              <em />
            </div>
            <p>
              One-on-one
              <br />
              attention
            </p>
          </div>
          <div className="salon-scroll" aria-hidden="true">
            SCROLL
            <br />
            SLOWLY
          </div>
        </section>

        <section className="salon-manifesto" id="story" data-section="about">
          <p data-reveal>{chrome.aboutKicker}</p>
          <h2 data-reveal style={revealDelay(80)}>
            Your time, your texture,
            <br />
            <em>your kind of beautiful.</em>
          </h2>
          <dl data-reveal style={revealDelay(160)}>
            {content.address && (
              <div>
                <dt>Address</dt>
                <dd>{content.address}</dd>
              </div>
            )}
            {content.phone && (
              <div>
                <dt>Phone</dt>
                <dd>{links.call ? <a href={links.call}>{content.phone}</a> : content.phone}</dd>
              </div>
            )}
            {rating && (
              <div>
                <dt>Google</dt>
                <dd>{rating}</dd>
              </div>
            )}
            <div>
              <dt>Hours</dt>
              <dd>Message or call to confirm today&apos;s hours</dd>
            </div>
          </dl>
        </section>

        <section className="salon-menu" id="menu" data-section="services">
          <header data-reveal>
            <p className="salon-kicker">{chrome.servicesKicker}</p>
            <span aria-hidden>
              01 — {pad(content.services.length - 1)}
            </span>
            <h2>
              Choose a
              <br />
              <em>little ritual.</em>
            </h2>
            {note && <p className="salon-menu-note">{note}</p>}
          </header>
          <ol className="salon-service-list">
            {content.services.map((service, i) => (
              <li key={service.title} data-reveal style={revealDelay((i % 4) * 70)}>
                <span>{pad(i)}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a href={cta} {...externalProps(cta)} aria-label={`Book ${service.title}`}>
                  <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="salon-lookbook" id="visit" data-section="visit">
          <header data-reveal>
            <p className="salon-kicker">{chrome.visitKicker}</p>
            <h2>
              Booking,
              <br />
              <em>made easy.</em>
            </h2>
            <a href={cta} {...externalProps(cta)}>
              {chrome.cta} <span aria-hidden>↗</span>
            </a>
          </header>
          <ol className="salon-steps">
            {steps.map((step, i) => (
              <li key={step.title} className={`salon-look-${(i % 3) + 1}`} data-reveal style={revealDelay(i * 110)}>
                <span>{pad(i)}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {(content.faqs.length > 0 || rating) && (
          <section className="salon-notes" data-section="faq">
            <p className="salon-kicker" data-reveal>
              Good to know
            </p>
            <div className="salon-notes-grid">
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

        <section className="salon-appointment" id="book" data-section="contact">
          <div data-reveal>
            <p className="salon-kicker">Book your appointment</p>
            <h2>
              Your chair
              <br />
              is <em>waiting.</em>
            </h2>
            <p>Send a message and the team will confirm a time that suits you.</p>
            {content.address && <address>{content.address}</address>}
          </div>
          <div className="salon-book-links" data-reveal style={revealDelay(120)}>
            {actions.length > 0 ? (
              actions.map((action) => (
                <a key={action.key} href={action.href} {...externalProps(action.href)}>
                  {action.label} <span aria-hidden>↗</span>
                </a>
              ))
            ) : (
              <p className="salon-book-empty">{noContactNote(content)}</p>
            )}
            <MapEmbed content={content} className="salon-map" />
          </div>
        </section>
      </main>

      <footer className="salon-footer">
        <a href="#top">{content.businessName}</a>
        <p>{conceptNotice(content, chrome)}</p>
      </footer>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
