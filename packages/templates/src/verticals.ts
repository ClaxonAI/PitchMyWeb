import {
  dentalContentSchema,
  type DentalBusinessInput,
  type DentalContent,
  type DentalLeadInput,
  type DentalService,
  type DentalTheme,
  type PreviewDesign,
  type PreviewTemplateCode,
  buildDentalContent,
  clampFaq,
  cleanTemplateText,
  phoneToDigits,
  pickPreviewDesign,
} from "./dental";

export type PreviewChrome = {
  noun: string;
  navServices: string;
  navVisit: string;
  servicesKicker: string;
  servicesTitle: string;
  servicesEm: string;
  visitKicker: string;
  visitTitle: string;
  visitSteps: { title: string; body: (name: string, address?: string) => string }[];
  aboutKicker: string;
  ratingLabel: string;
  reviewsLabel: string;
  closingTitle: string;
  closingEm: string;
  cta: string;
  callCta: string;
  footerKind: string;
  greeting: string;
  mark: PreviewTemplateCode;
};

type VerticalDef = {
  theme: DentalTheme;
  fallbackName: string;
  tagline: (area?: string) => string;
  intro: (name: string, area?: string) => string;
  genericServices: DentalService[];
  faqs: (name: string, phone?: string, address?: string) => DentalContent["faqs"];
  chrome: PreviewChrome;
};

const genericService = (title: string, description: string): DentalService => ({
  title,
  description,
  icon: "generic",
});

function bookingFaqs(kind: string, name: string, phone?: string, address?: string): DentalContent["faqs"] {
  const faqs: DentalContent["faqs"] = [
    {
      question: "How do I get in touch?",
      answer: phone
        ? `Send a message on WhatsApp or call ${phone}. The team will confirm a time that suits you.`
        : `Get in touch with ${name} to find a time that suits you.`,
    },
    {
      question: `Is ${name} taking new customers?`,
      answer: "New customers are welcome. Message them to check the next available slot.",
    },
  ];
  if (address) faqs.push({ question: `Where is this ${kind}?`, answer: `You can find ${name} at ${address}.` });
  return faqs.map(clampFaq);
}

const VERTICALS: Record<Exclude<PreviewTemplateCode, "dental-clinic">, VerticalDef> = {
  clinic: {
    theme: "navy",
    fallbackName: "Clinic",
    tagline: (area) => (area ? `Consultant-led care in ${area}` : "Consultant-led care, close to you"),
    intro: (name, area) => `${name} is a clinic${area ? ` in ${area}` : ""} welcoming new and returning patients.`,
    genericServices: [
      genericService("Consultations", "Speak with the team about symptoms, history and next steps."),
      genericService("Diagnostics", "Tests and reviews arranged around what you actually need."),
      genericService("Follow-up care", "Ongoing review after your first visit, when it is needed."),
      genericService("Health checks", "Routine checks to catch problems early."),
    ],
    faqs: (name, phone, address) => bookingFaqs("clinic", name, phone, address),
    chrome: {
      noun: "Clinic",
      navServices: "Care",
      navVisit: "Your visit",
      servicesKicker: "Care",
      servicesTitle: "Clear, practical care",
      servicesEm: "under one roof.",
      visitKicker: "Your visit",
      visitTitle: "Booking takes a minute. No forms, no waiting on hold.",
      visitSteps: [
        { title: "Send a message", body: (n) => `Get in touch with ${n} and tell them what you need.` },
        { title: "Pick a time", body: () => "The team replies with available slots that fit your day." },
        { title: "Visit the clinic", body: (n, a) => (a ? `Come in at ${a}.` : `Come in to ${n} for your appointment.`) },
      ],
      aboutKicker: "About the clinic",
      ratingLabel: "Rated by patients on Google",
      reviewsLabel: "patient reviews",
      closingTitle: "Your next visit starts with",
      closingEm: "one message.",
      cta: "Book on WhatsApp",
      callCta: "Call the clinic",
      footerKind: "clinic",
      greeting: "I would like to book an appointment.",
      mark: "clinic",
    },
  },
  restaurant: {
    theme: "amber",
    fallbackName: "Restaurant",
    tagline: (area) => (area ? `A table worth booking in ${area}` : "A table worth booking"),
    intro: (name, area) => `${name} is a restaurant${area ? ` in ${area}` : ""} for everyday meals and special evenings.`,
    genericServices: [
      genericService("Lunch & dinner", "Everyday plates and evening meals. Ask for today's menu when you book."),
      genericService("Family dining", "A table for families and groups, when the restaurant can take you."),
      genericService("Takeaway", "Collect food to go, if the kitchen offers it."),
      genericService("Private occasions", "Ask about a reserved table for a small gathering."),
    ],
    faqs: (name, phone, address) => bookingFaqs("restaurant", name, phone, address),
    chrome: {
      noun: "Restaurant",
      navServices: "Menu",
      navVisit: "Visit",
      servicesKicker: "The kitchen",
      servicesTitle: "Food made for the table",
      servicesEm: "in front of you.",
      visitKicker: "Visit",
      visitTitle: "Reserve a table in a message. No apps required.",
      visitSteps: [
        { title: "Send a message", body: (n) => `Tell ${n} the day, time and how many seats you need.` },
        { title: "Confirm the table", body: () => "They reply with what is free." },
        { title: "Come in", body: (n, a) => (a ? `Find them at ${a}.` : `Come in to ${n}.`) },
      ],
      aboutKicker: "About the restaurant",
      ratingLabel: "Rated by diners on Google",
      reviewsLabel: "diner reviews",
      closingTitle: "Tonight's table starts with",
      closingEm: "one message.",
      cta: "Reserve on WhatsApp",
      callCta: "Call the restaurant",
      footerKind: "restaurant",
      greeting: "I would like to reserve a table.",
      mark: "restaurant",
    },
  },
  salon: {
    theme: "violet",
    fallbackName: "Salon",
    tagline: (area) => (area ? `Hair, beauty and care in ${area}` : "Hair, beauty and care"),
    intro: (name, area) => `${name} is a salon${area ? ` in ${area}` : ""} for hair, beauty and self-care appointments.`,
    genericServices: [
      genericService("Hair cut & styling", "Cuts, blow-dries and finishing. Confirm with the stylist when you book."),
      genericService("Colour", "Colour, highlights and treatments, subject to what the salon offers."),
      genericService("Facial & skin", "Skin treatments when the salon lists them."),
      genericService("Nails", "Manicure and pedicure, if available."),
    ],
    faqs: (name, phone, address) => bookingFaqs("salon", name, phone, address),
    chrome: {
      noun: "Salon",
      navServices: "Services",
      navVisit: "Your visit",
      servicesKicker: "Services",
      servicesTitle: "Style, colour and care",
      servicesEm: "in one chair.",
      visitKicker: "Your visit",
      visitTitle: "Book a chair in a message.",
      visitSteps: [
        { title: "Send a message", body: (n) => `Tell ${n} the service and the day you prefer.` },
        { title: "Pick a slot", body: () => "The team confirms who is free." },
        { title: "Walk in", body: (n, a) => (a ? `Find them at ${a}.` : `Visit ${n}.`) },
      ],
      aboutKicker: "About the salon",
      ratingLabel: "Rated by clients on Google",
      reviewsLabel: "client reviews",
      closingTitle: "Your next appointment starts with",
      closingEm: "one message.",
      cta: "Book on WhatsApp",
      callCta: "Call the salon",
      footerKind: "salon",
      greeting: "I would like to book a salon appointment.",
      mark: "salon",
    },
  },
  gym: {
    theme: "ember",
    fallbackName: "Gym",
    tagline: (area) => (area ? `Train at your pace in ${area}` : "Train at your pace"),
    intro: (name, area) => `${name} is a fitness studio${area ? ` in ${area}` : ""} for training at your own pace.`,
    genericServices: [
      genericService("Personal training", "One-to-one sessions if the gym offers a trainer."),
      genericService("Strength work", "Weights and conditioning, as the floor allows."),
      genericService("Group sessions", "Small groups when they are on the timetable."),
      genericService("Intro session", "A first visit to see if the place suits you."),
    ],
    faqs: (name, phone, address) => bookingFaqs("gym", name, phone, address),
    chrome: {
      noun: "Gym",
      navServices: "Training",
      navVisit: "Start",
      servicesKicker: "Training",
      servicesTitle: "Simple training,",
      servicesEm: "no hype.",
      visitKicker: "Start",
      visitTitle: "Ask for an intro session. Bring comfortable clothes.",
      visitSteps: [
        { title: "Send a message", body: (n) => `Tell ${n} what you want to work on.` },
        { title: "Book an intro", body: () => "They reply with a time to come in." },
        { title: "Train", body: (n, a) => (a ? `Find the floor at ${a}.` : `Visit ${n}.`) },
      ],
      aboutKicker: "About the gym",
      ratingLabel: "Rated by members on Google",
      reviewsLabel: "member reviews",
      closingTitle: "Your next session starts with",
      closingEm: "one message.",
      cta: "Book on WhatsApp",
      callCta: "Call the gym",
      footerKind: "gym",
      greeting: "I would like to book a training session.",
      mark: "gym",
    },
  },
  interiors: {
    theme: "stone",
    fallbackName: "Studio",
    tagline: (area) => (area ? `Interiors and fit-out in ${area}` : "Interiors and fit-out"),
    intro: (name, area) => `${name} is an interiors studio${area ? ` in ${area}` : ""} for homes and workspaces.`,
    genericServices: [
      genericService("Interior design", "Layouts, materials and finishes for a room or a whole home."),
      genericService("Space planning", "How a room should work before anything is built."),
      genericService("Kitchen & wardrobe", "Fitted work, if the studio takes it on."),
      genericService("Site visits", "A visit to the space before a quote."),
    ],
    faqs: (name, phone, address) => bookingFaqs("studio", name, phone, address),
    chrome: {
      noun: "Interiors",
      navServices: "Work",
      navVisit: "Enquire",
      servicesKicker: "Work",
      servicesTitle: "Rooms that work",
      servicesEm: "and look considered.",
      visitKicker: "Enquire",
      visitTitle: "Start with a site visit, not a catalogue.",
      visitSteps: [
        { title: "Send a message", body: (n) => `Tell ${n} the space and what you want changed.` },
        { title: "Book a visit", body: () => "They confirm a time to see the site." },
        { title: "Meet", body: (n, a) => (a ? `Studio at ${a}, or they come to you.` : `Arrange a meeting with ${n}.`) },
      ],
      aboutKicker: "About the studio",
      ratingLabel: "Rated on Google",
      reviewsLabel: "reviews",
      closingTitle: "Your next room starts with",
      closingEm: "one message.",
      cta: "Enquire on WhatsApp",
      callCta: "Call the studio",
      footerKind: "studio",
      greeting: "I would like to enquire about an interiors project.",
      mark: "interiors",
    },
  },
  event: {
    theme: "wine",
    fallbackName: "Events",
    tagline: (area) => (area ? `Events planned in ${area}` : "Events, planned with care"),
    intro: (name, area) => `${name} plans events${area ? ` in ${area}` : ""} — ask them what they take on.`,
    genericServices: [
      genericService("Weddings", "Day-of planning and coordination, if they take weddings."),
      genericService("Private events", "Birthdays, dinners and small gatherings."),
      genericService("Corporate", "Work events when the team handles them."),
      genericService("Venue help", "Help choosing a venue, if that is part of the brief."),
    ],
    faqs: (name, phone, address) => bookingFaqs("planner", name, phone, address),
    chrome: {
      noun: "Events",
      navServices: "Events",
      navVisit: "Enquire",
      servicesKicker: "Events",
      servicesTitle: "A day that runs",
      servicesEm: "the way you meant it.",
      visitKicker: "Enquire",
      visitTitle: "Start with the date and the kind of day you want.",
      visitSteps: [
        { title: "Send a message", body: (n) => `Tell ${n} the date, guest count and the kind of event.` },
        { title: "Talk it through", body: () => "They reply with whether they can take it on." },
        { title: "Meet", body: (n, a) => (a ? `Meet at ${a}, or online.` : `Arrange a call with ${n}.`) },
      ],
      aboutKicker: "About the planner",
      ratingLabel: "Rated on Google",
      reviewsLabel: "reviews",
      closingTitle: "Your date starts with",
      closingEm: "one message.",
      cta: "Enquire on WhatsApp",
      callCta: "Call the planner",
      footerKind: "event planner",
      greeting: "I would like to enquire about an event.",
      mark: "event",
    },
  },
  coaching: {
    theme: "ink",
    fallbackName: "Coaching",
    tagline: (area) => (area ? `Teaching that fits ${area}` : "Teaching that fits the student"),
    intro: (name, area) => `${name} offers coaching${area ? ` in ${area}` : ""} — ask which subjects and levels they take.`,
    genericServices: [
      genericService("One-to-one classes", "A session built around the student, if they offer it."),
      genericService("Small batches", "A handful of students at a time, when a batch is running."),
      genericService("Exam prep", "Board or entrance work, if that is on the list."),
      genericService("Trial class", "A first class to see if the teaching fits."),
    ],
    faqs: (name, phone, address) => bookingFaqs("centre", name, phone, address),
    chrome: {
      noun: "Coaching",
      navServices: "Classes",
      navVisit: "Join",
      servicesKicker: "Classes",
      servicesTitle: "Clear teaching,",
      servicesEm: "at the student's pace.",
      visitKicker: "Join",
      visitTitle: "Ask for a trial class. Bring a notebook.",
      visitSteps: [
        { title: "Send a message", body: (n) => `Tell ${n} the subject, class and what the student needs.` },
        { title: "Book a trial", body: () => "They confirm a slot." },
        { title: "Attend", body: (n, a) => (a ? `Find them at ${a}.` : `Visit ${n}.`) },
      ],
      aboutKicker: "About the centre",
      ratingLabel: "Rated on Google",
      reviewsLabel: "reviews",
      closingTitle: "The next class starts with",
      closingEm: "one message.",
      cta: "Enquire on WhatsApp",
      callCta: "Call the centre",
      footerKind: "coaching centre",
      greeting: "I would like to enquire about classes.",
      mark: "coaching",
    },
  },
};

const DENTAL_CHROME: PreviewChrome = {
  noun: "Dental clinic",
  navServices: "Treatments",
  navVisit: "Your visit",
  servicesKicker: "Treatments",
  servicesTitle: "Everyday care and specialist treatment,",
  servicesEm: "under one roof.",
  visitKicker: "Your visit",
  visitTitle: "Booking takes a minute. No forms, no waiting on hold.",
  visitSteps: [
    { title: "Send a message", body: (n) => `Get in touch with ${n} and tell them what you need.` },
    { title: "Pick a time", body: () => "The team replies with available slots, so you can choose one that fits your day." },
    { title: "Visit the clinic", body: (n, a) => (a ? `Come in at ${a}.` : `Come in to ${n} for your appointment.`) },
  ],
  aboutKicker: "About the clinic",
  ratingLabel: "Rated by patients on Google",
  reviewsLabel: "patient reviews",
  closingTitle: "Your next check-up starts with",
  closingEm: "one message.",
  cta: "Book on WhatsApp",
  callCta: "Call the clinic",
  footerKind: "clinic",
  greeting: "I would like to book an appointment.",
  mark: "dental-clinic",
};

export function pickPreviewTemplate(category: string | null | undefined): PreviewTemplateCode {
  const value = (category ?? "").toLowerCase();
  if (/dental|dentist|orthodont/.test(value)) return "dental-clinic";
  if (/restaurant|cafe|café|bakery|cloud kitchen|food|dhaba|hotel/.test(value)) return "restaurant";
  if (/salon|saloon|hair|beauty|spa|barber/.test(value)) return "salon";
  if (/gym|fitness|yoga|crossfit|pilates/.test(value)) return "gym";
  if (/interior|architect|decor|furniture/.test(value)) return "interiors";
  if (/event|wedding|planner|banquet/.test(value)) return "event";
  if (/coach|tuition|tutor|education|institute|academy|class/.test(value)) return "coaching";
  if (/clinic|hospital|doctor|cardio|medical|physio/.test(value)) return "clinic";
  return "clinic";
}

export function getPreviewChrome(template: PreviewTemplateCode): PreviewChrome {
  if (template === "dental-clinic") return DENTAL_CHROME;
  return VERTICALS[template].chrome;
}

function servicesFromLead(raw: readonly string[] | null | undefined, fallback: DentalService[]): { services: DentalService[]; generic: boolean } {
  const titles = (raw ?? [])
    .map((item) => cleanTemplateText(item, 60))
    .filter((item): item is string => Boolean(item));
  const unique: DentalService[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      title,
      description: "Ask when you get in touch whether this is currently offered.",
      icon: "generic",
    });
    if (unique.length === 6) break;
  }
  if (unique.length >= 3) return { services: unique, generic: false };
  return { services: fallback, generic: true };
}

export type BuildPreviewContentOptions = {
  now?: Date;
  template?: PreviewTemplateCode;
  /** Force a design; when omitted one is picked at random for verticals that have several. */
  design?: PreviewDesign;
  /** Random source for the design pick (tests). */
  random?: () => number;
};

/**
 * Picks a vertical from the business category, then fills placeholders from
 * scrape facts only (name, phone, address, city, rating). Generic service
 * lists are labelled as such. No invented testimonials.
 */
export function buildPreviewContent(
  business: DentalBusinessInput,
  lead: DentalLeadInput = {},
  options: BuildPreviewContentOptions = {},
): DentalContent {
  const template = options.template ?? pickPreviewTemplate(business.category);
  if (template === "dental-clinic") return buildDentalContent(business, lead, options);

  const vertical = VERTICALS[template];
  const businessName = cleanTemplateText(business.name, 120) ?? vertical.fallbackName;
  const area = cleanTemplateText(business.city, 120);
  const address = cleanTemplateText(business.address, 300);
  const phone = cleanTemplateText(business.phone, 40);
  const phoneDigits = phoneToDigits(business.phone);
  const { services, generic } = servicesFromLead(lead.services, vertical.genericServices);

  const rating =
    typeof business.rating === "number" && business.rating > 0 ? Math.round(Math.min(5, business.rating) * 10) / 10 : undefined;
  const reviewCount =
    typeof business.reviewCount === "number" && business.reviewCount > 0 ? Math.floor(business.reviewCount) : undefined;

  const summary = cleanTemplateText(lead.summary, 400);
  const intro = summary ?? vertical.intro(businessName, area);

  const mapsQuery =
    address || area
      ? cleanTemplateText([businessName, address ?? area].filter(Boolean).join(", "), 300)
      : typeof business.latitude === "number" && typeof business.longitude === "number"
        ? `${business.latitude},${business.longitude}`
        : undefined;

  return dentalContentSchema.parse({
    template,
    design: options.design ?? pickPreviewDesign(template, options.random),
    theme: vertical.theme,
    businessName,
    ...(area ? { area } : {}),
    tagline: vertical.tagline(area),
    intro,
    ...(phone ? { phone } : {}),
    ...(phoneDigits ? { phoneDigits } : {}),
    ...(address ? { address } : {}),
    ...(mapsQuery ? { mapsQuery } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(reviewCount !== undefined ? { reviewCount } : {}),
    services,
    servicesAreGeneric: generic,
    faqs: vertical.faqs(businessName, phone, address),
    generatedAt: (options.now ?? new Date()).toISOString(),
  });
}
