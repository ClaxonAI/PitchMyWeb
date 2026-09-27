import { describe, expect, it } from "vitest";
import { readEmailConfig, senderAddress } from "./config";

const KEY = "test-resend-key-not-real";

describe("readEmailConfig", () => {
  it("is off unless both the key and the sender are set", () => {
    expect(readEmailConfig({})).toEqual({ ok: false, reason: "not_configured" });
    expect(readEmailConfig({ RESEND_API_KEY: KEY })).toEqual({ ok: false, reason: "not_configured" });
    expect(readEmailConfig({ RESEND_FROM_EMAIL: "no-reply@pitchmyweb.in" })).toEqual({ ok: false, reason: "not_configured" });
    expect(readEmailConfig({ RESEND_API_KEY: " ", RESEND_FROM_EMAIL: "no-reply@pitchmyweb.in" })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("accepts a named or bare sender, trims, and makes reply-to optional", () => {
    expect(readEmailConfig({ RESEND_API_KEY: ` ${KEY} `, RESEND_FROM_EMAIL: " PitchMyWeb <no-reply@pitchmyweb.in> " })).toEqual({
      ok: true,
      config: { apiKey: KEY, from: "PitchMyWeb <no-reply@pitchmyweb.in>", replyTo: null },
    });
    expect(readEmailConfig({ RESEND_API_KEY: KEY, RESEND_FROM_EMAIL: "no-reply@pitchmyweb.in", RESEND_REPLY_TO_EMAIL: "support@claxonai.in" })).toEqual({
      ok: true,
      config: { apiKey: KEY, from: "no-reply@pitchmyweb.in", replyTo: "support@claxonai.in" },
    });
  });

  it("refuses a malformed sender or reply-to rather than sending from it", () => {
    expect(readEmailConfig({ RESEND_API_KEY: KEY, RESEND_FROM_EMAIL: "PitchMyWeb" })).toEqual({ ok: false, reason: "invalid_from" });
    expect(readEmailConfig({ RESEND_API_KEY: KEY, RESEND_FROM_EMAIL: "no-reply@pitchmyweb.in", RESEND_REPLY_TO_EMAIL: "support" })).toEqual({ ok: false, reason: "invalid_reply_to" });
  });

  it("refuses Resend's shared test sender in production only", () => {
    const env = { RESEND_API_KEY: KEY, RESEND_FROM_EMAIL: "Test <onboarding@resend.dev>" };
    expect(readEmailConfig({ ...env, APP_ENV: "production" })).toEqual({ ok: false, reason: "test_sender_in_production" });
    expect(readEmailConfig({ ...env, APP_ENV: "development" })).toMatchObject({ ok: true });
  });
});

describe("senderAddress", () => {
  it("finds the address in either form", () => {
    expect(senderAddress("PitchMyWeb <no-reply@pitchmyweb.in>")).toBe("no-reply@pitchmyweb.in");
    expect(senderAddress("no-reply@pitchmyweb.in")).toBe("no-reply@pitchmyweb.in");
    expect(senderAddress("<>")).toBeNull();
  });
});
