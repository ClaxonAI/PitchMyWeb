// Guides (/guides/[slug]): practical articles for freelancers and agencies
// who sell websites to local businesses. Written from how PitchMyWeb works;
// no invented statistics or quotes.

export type Guide = {
  slug: string;
  title: string;
  description: string;
  /** "YYYY-MM-DD": when the content last meaningfully changed (sitemap lastmod). */
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
};

export const guides: Guide[] = [
  {
    slug: "find-local-businesses-without-a-website",
    title: "How to find local businesses without a website",
    description: "Where businesses without a website hide, how to confirm they really have none, and how to build a list worth pitching.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Start from the map, not a search engine",
        paragraphs: [
          "A business without a website rarely shows up in ordinary search results, but it almost always has a map listing: a name, a phone number, an address and a category. Map listings are where to look.",
          "Pick one category and one area at a time, such as dental clinics in one neighbourhood. A narrow search gives you a list you can actually work through and a pitch you can tailor.",
        ],
      },
      {
        heading: "Confirm there is really no site",
        paragraphs: [
          "Plenty of listings leave the website field empty while the business has a site somewhere. Search the exact business name with the city before you count it. A social page is not a website: it still counts as a lead.",
          "PitchMyWeb runs this check for you: every lead is verified for a live website before it is offered, so you only pitch businesses that genuinely need one.",
        ],
      },
      {
        heading: "Keep only leads you can reach",
        paragraphs: [
          "A lead without a working mobile number is a lead you cannot pitch on WhatsApp. Drop landlines and missing numbers early rather than discovering the gap at send time.",
        ],
      },
    ],
  },
  {
    slug: "pitch-a-website-on-whatsapp",
    title: "How to pitch a website to a business owner on WhatsApp",
    description: "What to write, when to send it and why a finished sample beats a description of one.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Show, then ask",
        paragraphs: [
          "Owners are asked to buy websites all the time, usually by someone describing what they could build. A link to a page that already carries their business name, services and a booking button is a different conversation: they are reacting to something real.",
        ],
      },
      {
        heading: "Keep the message short",
        paragraphs: [
          "Two or three lines: who you are, that you made them a sample site, and the link. Use their business name. Leave the price for the reply, when they are already interested.",
          "In PitchMyWeb you write the message once for a campaign, with {{business_name}} and {{site_link}} filled in for each lead, and you can edit it while the campaign runs.",
        ],
      },
      {
        heading: "Send from your own number, at a human pace",
        paragraphs: [
          "Messages from a real number that the owner can reply to get answered; blasts from unknown senders get blocked. Space messages out and never message the same owner twice in a short window.",
        ],
      },
    ],
  },
  {
    slug: "sample-website-before-selling",
    title: "Why you should build the sample website before you sell it",
    description: "The case for spending the effort before the sale, and how to do it without losing hours per lead.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "The sample does the selling",
        paragraphs: [
          "A business owner who has never had a website has trouble imagining one. A sample built around their own name, category and location removes the imagination step: they see it and decide.",
        ],
      },
      {
        heading: "Make it cheap to build",
        paragraphs: [
          "Building by hand for every lead does not scale. Start from a template per trade (clinic, restaurant, salon and so on) and fill it with the lead's own details: name, services, timings, address, phone.",
          "PitchMyWeb builds these automatically for every lead in a campaign and publishes each one on its own link.",
        ],
      },
      {
        heading: "Record a walkthrough",
        paragraphs: [
          "Many owners open WhatsApp on their phone and will not tap an unknown link. A short video of the site, on a phone screen and a laptop screen, lets them see it without clicking anything.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-outreach-best-practices",
    title: "WhatsApp outreach best practices for web designers",
    description: "Keep your number healthy, respect opt-outs and get replies instead of blocks.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Respect the recipient",
        paragraphs: [
          "Message businesses, not private individuals, and only about something relevant to their business. Honour every request to stop, and keep a list so it sticks.",
        ],
      },
      {
        heading: "Pace your sending",
        paragraphs: [
          "Sending dozens of identical messages in a minute is what gets numbers flagged. Personalise each message and space them out. PitchMyWeb applies sending limits and an opt-out list automatically.",
        ],
      },
      {
        heading: "Check the number first",
        paragraphs: [
          "Not every mobile number is on WhatsApp. Checking before you send avoids failed messages; PitchMyWeb checks each lead and, if a number is not on WhatsApp, pitches the next lead instead of wasting the credit.",
        ],
      },
    ],
  },
  {
    slug: "price-a-small-business-website",
    title: "How to price a small business website",
    description: "Simple ways to price websites for local businesses so the owner says yes and the work stays worth doing.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Price the outcome, not the pages",
        paragraphs: [
          "A clinic owner does not buy five pages; they buy patients who can find them and book. Talk about bookings and enquiries, and keep the page count out of the quote.",
        ],
      },
      {
        heading: "Offer a setup fee plus a small monthly",
        paragraphs: [
          "A modest one-off setup price with a monthly fee for hosting and updates is easy for a small business to agree to, and gives you recurring income.",
        ],
      },
      {
        heading: "Anchor with the sample",
        paragraphs: [
          "When the owner has already seen their site, the question becomes what it costs to make it live, not whether they want a website at all. That is a much easier price conversation.",
        ],
      },
    ],
  },
  {
    slug: "follow-up-after-a-website-pitch",
    title: "How to follow up after a website pitch",
    description: "When to follow up, what to say, and when to stop.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Wait for the message to be read",
        paragraphs: [
          "A pitch that was delivered but not read has not failed yet. Give owners a couple of days: many check WhatsApp business messages in batches.",
        ],
      },
      {
        heading: "Add something new",
        paragraphs: [
          "A follow-up that repeats the first message reads as spam. Add one useful detail instead: a change you made to their sample, or a question about their bookings.",
        ],
      },
      {
        heading: "Stop after one follow-up",
        paragraphs: [
          "If there is no reply after one follow-up, move on. Your time is better spent on the next lead than on a third message that risks a block.",
        ],
      },
    ],
  },
  {
    slug: "local-seo-basics-for-small-businesses",
    title: "Local SEO basics to explain to small business clients",
    description: "The few things that make a local business findable, in words an owner understands.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Consistent name, address and phone",
        paragraphs: [
          "Search engines match a business across its website and its map listing. The same name, address and phone number everywhere is the foundation.",
        ],
      },
      {
        heading: "Say what you do and where",
        paragraphs: [
          "A page that clearly states the services and the neighbourhood answers the exact searches customers make, such as a dentist near a particular area.",
        ],
      },
      {
        heading: "Make contacting you effortless",
        paragraphs: [
          "A tap-to-message or tap-to-call button turns a visit into a customer. Every PitchMyWeb sample site leads with one.",
        ],
      },
    ],
  },
  {
    slug: "start-a-web-design-side-business",
    title: "How to start a web design side business selling to local shops",
    description: "A practical path from zero clients to a steady pipeline of local businesses.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Pick one trade",
        paragraphs: [
          "Specialising in one kind of business (clinics, salons or restaurants) lets you reuse a template, speak their language and point to similar work.",
        ],
      },
      {
        heading: "Build a pipeline, not a portfolio",
        paragraphs: [
          "Early on, the bottleneck is conversations, not skills. A steady list of businesses without websites, each with a sample, keeps conversations coming.",
          "PitchMyWeb handles the list, the samples and the sending, so you can spend your time on the replies.",
        ],
      },
      {
        heading: "Deliver fast",
        paragraphs: [
          "The sample already exists, so turning a yes into a live site can take days, not weeks. Speed is itself a selling point for small business owners.",
        ],
      },
    ],
  },
  {
    slug: "auto-vs-direct-pitching",
    title: "Auto or Direct: choosing how your pitches are sent",
    description: "The difference between PitchMyWeb's Auto and Direct plans, and which suits you.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "Auto: sent from your WhatsApp for you",
        paragraphs: [
          "Link your WhatsApp for the campaign and PitchMyWeb sends each pitch, with the sample-site videos, from your own number. You are signed out again when the campaign finishes.",
        ],
      },
      {
        heading: "Direct: you press send",
        paragraphs: [
          "Each pitch comes as a one-tap wa.me link with the message filled in. Nothing is linked; you send them yourself, at your own pace, from any WhatsApp.",
        ],
      },
      {
        heading: "Which to choose",
        paragraphs: [
          "Auto suits WhatsApp Business users who want pitches going out while they work. Direct suits anyone who prefers to send personally or uses a personal number.",
        ],
      },
    ],
  },
  {
    slug: "what-a-local-business-website-needs",
    title: "What a local business website actually needs",
    description: "The short list of sections that matter to a local customer, and what to leave out.",
    updated: "2026-09-25",
    sections: [
      {
        heading: "The essentials",
        paragraphs: [
          "Who the business is, what it offers, when it is open, where it is, and one obvious way to get in touch. A customer should find each in seconds on a phone.",
        ],
      },
      {
        heading: "Trust signals",
        paragraphs: [
          "Ratings, a few words about the team and real photos reassure a first-time customer. Frequently asked questions answer what they would otherwise phone to ask.",
        ],
      },
      {
        heading: "What to leave out",
        paragraphs: [
          "Long histories, sliders and stock photos slow the page and hide the booking button. A local site earns its keep by being quick to scan.",
        ],
      },
    ],
  },
];

export function findGuide(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}
