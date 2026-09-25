// Shared factual-safety heuristics for AI-generated free text (Phase 5
// section 5, Phase 7 section 7: "the AI must never invent phone numbers,
// addresses, review counts, ..."). Originally built for lead-analysis's
// `summary` field (lib/ai/business-validation.ts); Phase 7 reuses it
// as-is for pitch `message` text rather than writing a second copy of the
// same regex/logic ("do not duplicate existing AI infrastructure").
//
// A full free-text fact-checker (addresses, review counts, awards,
// customer claims, etc.) is not feasible to build deterministically —
// documented limitation, unchanged from Phase 5. This remains a narrow,
// concrete, testable heuristic for the one fact that has an unambiguous
// verified value to check against: the business's own phone number.

export type FactualSafetyResult = { valid: true } | { valid: false; reason: string };

const PHONE_LIKE_PATTERN = /\+?[\d][\d\-\s()]{7,}\d/g;
const MIN_PHONE_DIGITS = 9;

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

/**
 * Rejects text containing a phone-number-shaped sequence of digits (≥9,
 * to avoid false-positiving on ratings/review counts/percentages) that
 * doesn't match the business's own phone number on file. Matches on the
 * trailing 7 digits so formatting differences (+91-, spaces, a leading 0)
 * between the source record and generated prose don't false-flag.
 */
export function validateNoFabricatedPhoneNumber(text: string, actualPhone: string | null): FactualSafetyResult {
  const candidates = text.match(PHONE_LIKE_PATTERN) ?? [];
  const actualDigits = actualPhone ? onlyDigits(actualPhone) : null;

  for (const candidate of candidates) {
    const digits = onlyDigits(candidate);
    if (digits.length < MIN_PHONE_DIGITS) continue;

    const matchesActual = actualDigits !== null && actualDigits.length >= 7 && digits.endsWith(actualDigits.slice(-7));
    if (!matchesActual) {
      return { valid: false, reason: "text appears to contain a phone number that is not present in the business record" };
    }
  }

  return { valid: true };
}
