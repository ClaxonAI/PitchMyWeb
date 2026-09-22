export type PlanId = "auto" | "direct";
export type Market = "india" | "foreign";

/** A country a freelancer can target with a foreign campaign. */
export type Country = {
  code: string;
  name: string;
  currency: string;
  /** Approximate INR value of one unit of `currency`. */
  inrRate: number;
  /** A typical price a freelancer might charge for one site, in `currency`. */
  typicalSitePrice: number;
};

export type PlanPrice = {
  market: Market;
  /** Price of one batch, in `currency`'s major unit (e.g. dollars, rupees). */
  amount: number;
  /** Both markets are priced in INR; the market controls which plan access is unlocked. */
  currency: "USD" | "INR";
};

export type Plan = {
  id: PlanId;
  name: string;
  bestFor: string;
  headline: string;
  summary: string;
  /** Noun for one item in a batch, e.g. "pitches". */
  unitLabel: string;
  batchSize: number;
  prices: PlanPrice[];
  features: string[];
  popular?: boolean;
};

export type SampleSite = {
  /** Real preview vertical served by apps/sites `/demo/[template]`. */
  template: "dental-clinic" | "clinic" | "restaurant" | "salon" | "gym" | "interiors" | "event" | "coaching";
  domain: string;
  name: string;
  category: string;
  city: string;
  tagline: string;
  cta: string;
  theme: { bg: string; fg: string; accent: string; muted: string };
  layout: "split" | "centered" | "editorial";
  /** Which apps/sites layout the demo and its preview image use. */
  design: "classic" | "studio";
};

export type Testimonial = {
  quote: string;
  role: string;
  plan: string;
};

export type Faq = {
  question: string;
  answer: string;
};
