import { describe, expect, it } from "vitest";
import { classifyPhoneType, isPitchableBusiness, isPitchableType, pitchableBusinessFilter, UNKNOWN_PHONE_TYPE, whatsappDigits } from "./phone";

// The pitch queue's entry condition (plan rule: "a lead without a validated
// mobile number never enters the pitch queue"). Uses real libphonenumber-js
// rather than a fake: the whole point of this module is that it asks a
// metadata library a question no amount of digit-counting can answer, so a
// fake would only prove the fake agrees with itself.
//
// Indian numbers throughout, matching normalizePhone's "IN" default region.
// 98/99-prefixed 10-digit numbers are mobile ranges; 44 is Chennai's
// landline area code; 1800 is the toll-free range.

describe("classifyPhoneType", () => {
  it("classifies a real mobile number as MOBILE", () => {
    expect(classifyPhoneType("+91 98000 00001")).toBe("MOBILE");
    // Written without a country code — the IN default region supplies it.
    expect(classifyPhoneType("9900000001")).toBe("MOBILE");
  });

  it("classifies a landline as FIXED_LINE, which is not pitchable", () => {
    for (const landline of ["+91 44 2345 6789", "+91 12345 67890"]) {
      const type = classifyPhoneType(landline);
      expect(type).toBe("FIXED_LINE");
      expect(isPitchableType(type)).toBe(false);
    }
  });

  it("classifies a toll-free number as TOLL_FREE, which is not pitchable", () => {
    const type = classifyPhoneType("+91 1800 123 4567");
    expect(type).toBe("TOLL_FREE");
    expect(isPitchableType(type)).toBe(false);
  });

  it("returns null for a missing number", () => {
    expect(classifyPhoneType(null)).toBeNull();
  });

  it("returns null for digit strings that are not valid numbers", () => {
    // Each of these passes the old "8-15 digits" check, which is exactly why
    // that check was not good enough to spend a credit on: the last one is a
    // real mobile prefix one digit short of a real number.
    expect(classifyPhoneType("12345678")).toBeNull();
    expect(classifyPhoneType("000000000000")).toBeNull();
    expect(classifyPhoneType("+91 98000 0000")).toBeNull();
  });

  it("never throws on malformed input, however unlike a phone number", () => {
    for (const raw of ["", "not a phone", "+", "++91", "call us!", "+91 98000 00001 ext. 4"]) {
      expect(() => classifyPhoneType(raw)).not.toThrow();
    }
    expect(classifyPhoneType("not a phone")).toBeNull();
  });

  it("tolerates the punctuation a scrape actually returns for a valid number", () => {
    // Including the national form with India's "0" trunk prefix, which is
    // how plenty of listings write it.
    for (const raw of ["+91-98000-00001", "+91 (98000) 00001", "  +919800000001  ", "0 98000 00001"]) {
      expect(classifyPhoneType(raw)).toBe("MOBILE");
    }
  });
});

describe("isPitchableType", () => {
  it("accepts MOBILE and the ambiguous FIXED_LINE_OR_MOBILE bucket", () => {
    expect(isPitchableType("MOBILE")).toBe(true);
    // Deliberate: where a country's numbering plan does not separate mobile
    // from fixed-line, every number in the range lands here, and excluding
    // them would throw away genuinely reachable mobiles.
    expect(isPitchableType("FIXED_LINE_OR_MOBILE")).toBe(true);
  });

  it("rejects line types WhatsApp cannot reach, and unknown/absent types", () => {
    for (const type of ["FIXED_LINE", "TOLL_FREE", "PREMIUM_RATE", "VOIP", "PAGER", UNKNOWN_PHONE_TYPE, null]) {
      expect(isPitchableType(type)).toBe(false);
    }
  });
});

describe("isPitchableBusiness", () => {
  it("is pitchable with a valid number of a reachable type", () => {
    expect(isPitchableBusiness({ normalizedPhone: "+919800000001", phoneType: "MOBILE" })).toBe(true);
    expect(isPitchableBusiness({ normalizedPhone: "+919800000001", phoneType: "FIXED_LINE_OR_MOBILE" })).toBe(true);
  });

  it("is not pitchable with no valid number at all", () => {
    expect(isPitchableBusiness({ normalizedPhone: null, phoneType: "MOBILE" })).toBe(false);
    expect(isPitchableBusiness({ normalizedPhone: null, phoneType: null })).toBe(false);
  });

  it("is not pitchable when the number is a landline", () => {
    expect(isPitchableBusiness({ normalizedPhone: "+914423456789", phoneType: "FIXED_LINE" })).toBe(false);
  });

  it("treats an unclassified valid number as pitchable, so un-backfilled rows keep working", () => {
    // phoneType null on a valid number means "ingested before classification
    // existed", not "checked and unreachable" — see the backfill script.
    expect(isPitchableBusiness({ normalizedPhone: "+919800000001", phoneType: null })).toBe(true);
  });
});

describe("whatsappDigits", () => {
  it("returns E.164 without the leading + for a pitchable business", () => {
    expect(whatsappDigits({ normalizedPhone: "+919800000001", phoneType: "MOBILE" })).toBe("919800000001");
  });

  it("returns null for anything not pitchable, so a landline cannot be addressed by accident", () => {
    expect(whatsappDigits({ normalizedPhone: "+914423456789", phoneType: "FIXED_LINE" })).toBeNull();
    expect(whatsappDigits({ normalizedPhone: null, phoneType: null })).toBeNull();
  });
});

describe("pitchableBusinessFilter", () => {
  it("means the same thing as isPitchableBusiness", () => {
    // The filter runs in Postgres and the predicate runs in JS; they are two
    // expressions of one rule, so the risk is that they drift. This checks
    // the filter's shape covers exactly the cases the predicate accepts:
    // a non-null normalizedPhone, and a phoneType that is either null
    // (un-backfilled) or one of the reachable types.
    const filter = pitchableBusinessFilter();
    expect(filter.normalizedPhone).toEqual({ not: null });

    const accepted = filter.OR.flatMap((clause) =>
      clause.phoneType === null ? [null] : (clause.phoneType as { in: string[] }).in,
    );
    expect(new Set(accepted)).toEqual(new Set([null, "MOBILE", "FIXED_LINE_OR_MOBILE"]));
    for (const phoneType of accepted) {
      expect(isPitchableBusiness({ normalizedPhone: "+919800000001", phoneType })).toBe(true);
    }
  });

  it("returns a fresh object each call, so a caller cannot mutate the shared rule", () => {
    const first = pitchableBusinessFilter();
    first.OR.push({ phoneType: "FIXED_LINE" } as never);
    expect(pitchableBusinessFilter().OR).toHaveLength(2);
  });
});
