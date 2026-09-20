import { hasWebsite, socialPresenceCount, type BusinessSignalFields } from "../business/signals";
import type { ServiceCode } from "@pitchmyweb/db";

// Rule-based service recommendation (backend_tasks.md section 10). Purely
// deterministic — Ollama is never required for this to produce a result
// (Rule 6/architecture requirement: "Ollama must not be required for the
// recommendation engine to function"). A later phase may add an optional
// Ollama explanation/refinement step on top of whatever this returns, but
// never in place of it.

export type RecommendationInput = BusinessSignalFields & {
  category: string;
  rating: number | null;
  reviewCount: number | null;
  // Not produced by any Phase 1-3 pipeline (would come from a future
  // website-inspection/enrichment step) — optional and defaults to false
  // so the rule can exist without inventing data that doesn't exist yet.
  websiteOutdated?: boolean;
};

export type ServiceRecommendation = {
  service: ServiceCode;
  rationale: string;
};

// Keyword lists are intentionally simple, case-insensitive substring
// matches against the existing Business.category field (no new data is
// invented) and are easy to extend.
const APPOINTMENT_CATEGORY_KEYWORDS = ["clinic", "dental", "salon", "spa", "gym", "fitness", "yoga"];
const MENU_CATEGORY_KEYWORDS = ["restaurant", "cafe", "café", "bakery", "bar"];

const categoryMatches = (category: string, keywords: string[]): boolean => {
  const lower = category.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

type Rule = {
  service: ServiceCode;
  matches: (input: RecommendationInput) => boolean;
  rationale: string;
};

// Evaluated top-down; the first matching rule wins. Order follows the
// scoring engine's own signal weighting: the heaviest opportunity signal
// (no website) is checked first.
const RULES: Rule[] = [
  {
    service: "WEBSITE",
    matches: (input) => !hasWebsite(input),
    rationale: "No website on file — the single largest documented opportunity signal.",
  },
  {
    service: "WEBSITE_REDESIGN",
    matches: (input) => hasWebsite(input) && input.websiteOutdated === true,
    rationale: "Has a website but it is flagged outdated by enrichment data.",
  },
  {
    service: "APPOINTMENT_SYSTEM",
    matches: (input) => categoryMatches(input.category, APPOINTMENT_CATEGORY_KEYWORDS),
    rationale: "Business category typically relies on scheduled appointments.",
  },
  {
    service: "DIGITAL_MENU",
    matches: (input) => categoryMatches(input.category, MENU_CATEGORY_KEYWORDS),
    rationale: "Business category typically serves a walk-in food/menu audience.",
  },
  {
    service: "REVIEWS",
    matches: (input) => (input.reviewCount ?? 0) < 10,
    rationale: "Few or no reviews on file — building social proof is the priority.",
  },
  {
    service: "SEO",
    matches: (input) => socialPresenceCount(input) === 0,
    rationale: "No social presence on file — local search visibility is the priority.",
  },
];

// Broadly applicable fallback when no more specific rule matches: almost
// every business can be reached by phone, and a WhatsApp channel is the
// cheapest, fastest service to set up.
const FALLBACK_RULE: Rule = {
  service: "WHATSAPP",
  matches: () => true,
  rationale: "No more specific signal matched; WhatsApp is the broadest low-cost starting point.",
};

/**
 * Deterministically recommends one ServiceCode for a business.
 *
 * Assumption: AI_CHATBOT, AI_VOICE_AGENT and POS are valid ServiceCode
 * values (and valid Service records) that this deterministic engine does
 * not auto-select — no reliable Business-level signal exists yet to
 * distinguish when they apply. They remain selectable by a future
 * Ollama-refinement step or manual operator override; this function
 * always returns one of the other 7 codes.
 */
export function recommendService(input: RecommendationInput): ServiceRecommendation {
  const rule = RULES.find((candidate) => candidate.matches(input)) ?? FALLBACK_RULE;
  return { service: rule.service, rationale: rule.rationale };
}
