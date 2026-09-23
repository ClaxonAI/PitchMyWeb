import type { Faq } from "@/types";

// Two sets, deliberately disjoint. Both the home page and /pricing render an
// FAQ block, and they used to render this same array — the same six answers on
// two indexable URLs, which splits the ranking signal between them and gives a
// visitor who reads both nothing new the second time.
//
// The split is by what the reader is doing: `faqs` answers "what is this and
// does it work", `pricingFaqs` answers "what am I paying for and what happens
// if it goes wrong". Every answer below is stated somewhere else on the site
// already — /refunds, /terms, or the plan data — so keep them in step.

/** The home page. What the product is, and how the pitching works. */
export const faqs: Faq[] = [
  {
    question: "What exactly do I get in a batch?",
    answer:
      "A list of local businesses with no website, a custom sample site built for each one, and a short screen recording of that site. Auto sends the pitches for you. Direct hands them to you as one-tap WhatsApp links.",
  },
  {
    question: "Does the pitch go out from my number?",
    answer:
      "Yes. Every message comes from your own WhatsApp, so replies land in your chats and the client relationship is yours from the first message.",
  },
  {
    question: "Do I need to know design or code?",
    answer:
      "No. The sample sites are built for you. When a business says yes, you can build the final site with whatever tools you already use.",
  },
  {
    question: "Can two freelancers get the same business?",
    answer:
      "No. Leads are de-duplicated across every PitchMyWeb account, so a business you're pitching is never handed to anyone else.",
  },
];

/**
 * /pricing. Billing and guarantees.
 *
 * "Which plan should I pick?" and "What if a batch comes up short?" moved here
 * from the home set: both are questions someone asks with a card in their hand,
 * not while working out what the product is.
 */
export const pricingFaqs: Faq[] = [
  {
    question: "Which plan should I pick?",
    answer:
      "Pick Auto if you use WhatsApp Business and want it hands-off. Pick Direct if you use personal WhatsApp, or you'd rather read each pitch before it goes.",
  },
  {
    question: "Is this a subscription?",
    answer:
      "No. Every batch is a one-time purchase. Nothing renews, and there's no monthly fee — you buy another batch when you want one.",
  },
  {
    question: "When does my batch start?",
    answer:
      "When you say so. A batch you've paid for waits in your dashboard until you pick a city and niche and press Start. Nothing runs before that.",
  },
  {
    question: "What if a batch comes up short?",
    answer:
      "If we can't find the full number of valid leads, that batch is on us. You get a re-run or a refund, whichever you prefer.",
  },
  {
    question: "Can I get a refund if I change my mind?",
    answer:
      "Yes, at any point before you press Start. Once a batch has run and delivered its leads, sites and demos, that work is done and it can't be refunded. Email us with your order ID and approved refunds go back to your original payment method, usually within 5–7 working days.",
  },
  {
    question: "What currency am I charged in?",
    answer:
      "Indian rupees, wherever you are. Prices differ between India and the rest of the world, but every batch is charged in INR.",
  },
];
