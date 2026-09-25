import type { Faq } from "@/types";
import type { City } from "@/data/cities";
import type { Industry } from "@/data/industries";

// Shared copy for the SEO landing pages, so the steps and answers describe
// the product the same way everywhere (and match data/faq.ts and plans.ts).

export const HOW_IT_WORKS_STEPS = [
  "Pick a trade and an area. PitchMyWeb finds businesses there with a phone number but no website, and checks each one really has no site.",
  "Every lead gets its own sample website built from its name, category and location, recorded as a short video on a phone screen and a laptop screen.",
  "Link your WhatsApp for the campaign. Your message and both videos go out from your own number, at a safe pace, with opt-outs respected.",
  "Owners reply to you directly. You close the sale; the sample site is already built.",
];

export function industryFaqs(industry: Industry): Faq[] {
  return [
    {
      question: `How does PitchMyWeb find ${industry.name.toLowerCase()} without a website?`,
      answer: `It searches map listings for the category you choose (for example "${industry.searchTerms[0]}") in the area you pick, keeps the ones with a reachable mobile number, and verifies each has no live website before offering it to you.`,
    },
    {
      question: `What does the sample site for ${industry.singular} include?`,
      answer: `${industry.siteSections.join("; ")}. It is filled with the business's own name, category and address, so the owner sees their business, not a template.`,
    },
    {
      question: "Is the pitch sent from my number?",
      answer: "On the Auto plan, yes: you link your WhatsApp for the campaign and each pitch goes from your number; you are signed out when the campaign finishes. On the Direct plan you get one-tap wa.me links and send them yourself.",
    },
    {
      question: "What if the business isn't on WhatsApp?",
      answer: "The number is checked before sending. If it is not on WhatsApp, the credit goes to the next business on the list instead of being wasted.",
    },
  ];
}

export function cityFaqs(city: City): Faq[] {
  return [
    {
      question: `Can I choose the area within ${city.name}?`,
      answer: `Yes. You type the location when you start a campaign — the city, or a neighbourhood in ${city.name} — along with the kind of business you want to pitch.`,
    },
    {
      question: "Which businesses can I target?",
      answer: "Any category with local listings: clinics, restaurants, salons, gyms, coaching centres, interior designers and more. Each gets a sample site built on a template made for its trade.",
    },
    {
      question: "How much does it cost?",
      answer: "You buy pitches in batches; searching costs nothing. See the pricing page for the current Auto and Direct batch prices.",
    },
  ];
}
