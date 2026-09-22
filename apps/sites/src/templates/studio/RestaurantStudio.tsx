import "./restaurant.css";
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

// sachu45 "restaurant" design on scrape facts: the menu is the service list
// (no invented dishes or prices), the guest book is the real Google rating and
// the FAQ, and opening hours are left for the restaurant to confirm.

export function RestaurantStudio({ content }: StudioProps) {
  const { chrome, links } = studioLinks(content);
  const cta = primaryHref(links, "#book");
  const steps = visitSteps(content, links, chrome);
  const actions = contactActions(links, chrome);
  const rating = ratingLine(content);
  const note = servicesNote(content, chrome);

  return (
    <div className="table-cloth" id="top">
      <ConceptRibbon name={content.businessName} tone={{ background: "#21332d", color: "rgba(242,237,223,.72)", strong: "#f2eddf", accent: "#e0806f" }} />
      <header className="table-nav">
        <a href="#top" className="table-wordmark">
          {content.businessName}
        </a>
        <p>{content.area ?? "Kitchen / Table"}</p>
        <nav aria-label="Sections">
          <a href="#menu">{chrome.navServices}</a>
          <a href="#house">The house</a>
          <a href="#book">Find us</a>
        </nav>
      </header>

      <main>
        <section className="table-hero" data-section="hero">
          <div className="table-hero-card" data-reveal>
            <p>{content.tagline}</p>
            <h1>
              Come
              <br />
              <em>hungry.</em>
            </h1>
            <a href={cta} {...externalProps(cta)}>
              {chrome.cta} <span aria-hidden>→</span>
            </a>
          </div>
          <div className="table-hero-plate" aria-hidden="true" data-reveal style={revealDelay(140)}>
            <div className="table-plate-shadow" />
            <div className="table-plate">
              <span>◌</span>
              <i />
              <b />
            </div>
            <p>
              Everyday
              <br />
              occasions
            </p>
          </div>
          {content.area && <aside aria-hidden="true">{content.area}</aside>}
        </section>

        <section className="table-note" id="house" data-section="about">
          <span data-reveal>01 / {chrome.aboutKicker}</span>
          <p data-reveal style={revealDelay(80)}>
            Food that does not need an occasion.
          </p>
          <div data-reveal style={revealDelay(160)}>
            <p>{content.intro}</p>
            {rating && <p className="table-note-rating">★ {rating}</p>}
            <a href="#menu">
              See the {chrome.navServices.toLowerCase()} <span aria-hidden>↓</span>
            </a>
          </div>
        </section>

        <section className="table-menu" id="menu" data-section="services">
          <header data-reveal>
            <p>{chrome.servicesKicker}</p>
            <h2>
              What&apos;s
              <br />
              <em>on the table.</em>
            </h2>
            <p>{note ?? "What the kitchen offers. Ask for today's menu and prices when you get in touch."}</p>
          </header>
          <ol className="table-menu-list">
            {content.services.map((service, i) => (
              <li key={service.title} data-reveal style={revealDelay((i % 3) * 90)}>
                <span>{pad(i)}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="table-principles" aria-label={chrome.visitKicker} data-section="visit">
          {steps.map((step, i) => (
            <article key={step.title} data-reveal style={revealDelay(i * 110)}>
              <span>{pad(i)}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </section>

        {content.faqs.length > 0 && (
          <section className="table-reviews" data-section="faq">
            <header data-reveal>
              <span>02 / Good to know</span>
              <h2>
                Before
                <br />
                you <em>come.</em>
              </h2>
            </header>
            <div>
              {content.faqs.map((faq, i) => (
                <article key={faq.question} data-reveal style={revealDelay(i * 90)}>
                  <b aria-hidden>{pad(i)}</b>
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section id="book" className="table-booking" data-section="contact">
          <div data-reveal>
            <p>Walk in, or make a plan</p>
            <h2>
              Meet us
              <br />
              at the <em>table.</em>
            </h2>
            {(content.address || content.phone) && (
              <dl>
                {content.address && (
                  <div>
                    <dt>Find us</dt>
                    <dd>{content.address}</dd>
                  </div>
                )}
                {content.phone && (
                  <div>
                    <dt>Call</dt>
                    <dd>{links.call ? <a href={links.call}>{content.phone}</a> : content.phone}</dd>
                  </div>
                )}
                <div>
                  <dt>Hours</dt>
                  <dd>Message or call to confirm today&apos;s hours</dd>
                </div>
              </dl>
            )}
          </div>
          <div className="table-booking-actions" data-reveal style={revealDelay(120)}>
            {actions.length > 0 ? (
              actions.map((action) => (
                <a key={action.key} className="table-book-link" href={action.href} {...externalProps(action.href)}>
                  {action.label} <span aria-hidden>→</span>
                </a>
              ))
            ) : (
              <p className="table-book-empty">{noContactNote(content)}</p>
            )}
            <MapEmbed content={content} className="table-map" />
          </div>
        </section>
      </main>

      <footer className="table-footer">
        <a href="#top">{content.businessName}</a>
        <p>{conceptNotice(content, chrome)}</p>
      </footer>
      {links.whatsapp && <FloatingWhatsApp href={links.whatsapp} label={chrome.cta} />}
      <RevealOnScroll />
    </div>
  );
}
