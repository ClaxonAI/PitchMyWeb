// libphonenumber-js/max, not the default entry point. The default ships
// "min" metadata, which can answer "is this a valid number?" but has no line
// type information at all: getType() returns undefined for every number,
// valid or not. Classifying against min metadata would therefore mark the
// entire database UNKNOWN and, once backfilled, unpitchable — every lead
// silently unreachable. "max" is the only variant that carries the type
// patterns. It is also the stricter validator, which is the behaviour we
// want here for the same reason: an 8-digit number that matches no published
// range in the country should not be worth a credit.
import { parsePhoneNumberWithError, type CountryCode } from "libphonenumber-js/max";

// Phone qualification for pitching. A lead is only worth a pitch credit if
// WhatsApp can actually reach it, and "has a phone-shaped string" was never
// a good enough test for that: the previous check (strip non-digits, accept
// 8-15 of them) passed landlines, toll-free numbers, and any digit string
// of roughly the right length. A Maps scrape returns plenty of all three.
//
// This deliberately adds one fact and no more. lib/business/normalize.ts
// already parses the provider's raw string with libphonenumber and stores
// the validated E.164 result as Business.normalizedPhone — so validity and
// the dialable number both already exist. What nobody ever asked
// libphonenumber for is the *line type*, which is the whole difference
// between a number worth spending a credit on and a reception desk.

/**
 * Line types a WhatsApp message has a real chance of reaching.
 *
 * FIXED_LINE_OR_MOBILE is included deliberately. libphonenumber can only
 * distinguish mobile from fixed-line where a country's published numbering
 * plan makes that distinction available; where it does not, every number in
 * the range comes back FIXED_LINE_OR_MOBILE. Excluding those would throw
 * away genuinely reachable mobiles, which is the opposite of the point.
 * Tighten to MOBILE-only here if real delivery data ever shows the
 * ambiguous bucket failing at a meaningfully higher rate.
 */
const PITCHABLE_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

/** Recorded when a number parses but its range carries no type information. */
export const UNKNOWN_PHONE_TYPE = "UNKNOWN";

export function isPitchableType(type: string | null): boolean {
  return type !== null && PITCHABLE_TYPES.has(type);
}

/**
 * The line type of a raw provider-supplied phone string, or null when it
 * does not parse as a valid number at all. `defaultRegion` covers numbers
 * written without a country code, matching normalizePhone's own India-first
 * default; a number carrying its own `+<cc>` ignores it.
 *
 * Never throws — an unparseable phone is a lead-quality fact, not an error
 * worth failing an ingest over.
 */
export function classifyPhoneType(phone: string | null, defaultRegion: CountryCode = "IN"): string | null {
  if (phone === null) return null;
  try {
    const parsed = parsePhoneNumberWithError(phone, defaultRegion);
    if (!parsed.isValid()) return null;
    return parsed.getType() ?? UNKNOWN_PHONE_TYPE;
  } catch {
    return null;
  }
}

/**
 * Whether a business can be pitched: a valid number (normalizedPhone, set
 * by lib/business/normalize.ts) of a line type WhatsApp can reach.
 *
 * `phoneType` null on an otherwise-valid number means the row predates
 * classification and has not been backfilled yet — treated as pitchable so
 * an un-backfilled database keeps working exactly as it did before, rather
 * than silently making every existing lead unpitchable.
 */
export function isPitchableBusiness(business: { normalizedPhone: string | null; phoneType: string | null }): boolean {
  if (business.normalizedPhone === null) return false;
  return business.phoneType === null || isPitchableType(business.phoneType);
}

/**
 * The same predicate as isPitchableBusiness, as a Prisma `Business` filter,
 * so "how many of this campaign's leads are pitchable?" is one COUNT in
 * Postgres instead of twenty thousand rows loaded into JS and filtered
 * there. Kept adjacent to the predicate on purpose: the two must always
 * mean the same thing, including the un-backfilled `phoneType IS NULL`
 * case.
 */
export function pitchableBusinessFilter() {
  return {
    normalizedPhone: { not: null },
    OR: [{ phoneType: null }, { phoneType: { in: Array.from(PITCHABLE_TYPES) } }],
  };
}

/**
 * The digits wa.me links and the WhatsApp worker expect: E.164 without the
 * leading `+`. Null for anything not pitchable, so a caller cannot
 * accidentally address a landline.
 */
export function whatsappDigits(business: { normalizedPhone: string | null; phoneType: string | null }): string | null {
  if (!isPitchableBusiness(business)) return null;
  return business.normalizedPhone!.replace(/^\+/, "");
}
