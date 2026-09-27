import { describe, expect, it, vi } from "vitest";
import { HumanCheckFailedError, HumanCheckUnavailableError } from "../errors";
import { REGISTER_ACTION, assertHuman, turnstileSecret } from "./turnstile";

const SECRET = "test-turnstile-secret";

function siteverify(result: Record<string, unknown>, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(result), { status, headers: { "content-type": "application/json" } }));
}

describe("turnstileSecret", () => {
  it("is null when unset or blank", () => {
    expect(turnstileSecret({})).toBeNull();
    expect(turnstileSecret({ TURNSTILE_SECRET_KEY: "  " })).toBeNull();
    expect(turnstileSecret({ TURNSTILE_SECRET_KEY: " abc " })).toBe("abc");
  });
});

describe("assertHuman", () => {
  it("does nothing without a secret, token or not", async () => {
    const fetchImpl = siteverify({ success: false });
    await expect(assertHuman(undefined, null, REGISTER_ACTION, { secret: null, fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a missing token without asking Cloudflare", async () => {
    const fetchImpl = siteverify({ success: true });
    await expect(assertHuman(undefined, "203.0.113.5", REGISTER_ACTION, { secret: SECRET, fetchImpl })).rejects.toBeInstanceOf(HumanCheckFailedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a token Cloudflare confirms for this action, sending the secret, token and client address", async () => {
    const fetchImpl = siteverify({ success: true, action: REGISTER_ACTION });
    await assertHuman("tok", "203.0.113.5", REGISTER_ACTION, { secret: SECRET, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(JSON.parse(String(init?.body))).toEqual({ secret: SECRET, response: "tok", remoteip: "203.0.113.5" });
  });

  it("leaves out a client address that is only a fingerprint", async () => {
    const fetchImpl = siteverify({ success: true, action: REGISTER_ACTION });
    await assertHuman("tok", "local-abc123", REGISTER_ACTION, { secret: SECRET, fetchImpl });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).not.toHaveProperty("remoteip");
  });

  it("refuses a token Cloudflare rejects", async () => {
    const fetchImpl = siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
    await expect(assertHuman("tok", null, REGISTER_ACTION, { secret: SECRET, fetchImpl })).rejects.toBeInstanceOf(HumanCheckFailedError);
  });

  it("refuses a token solved for another action", async () => {
    const fetchImpl = siteverify({ success: true, action: "login" });
    await expect(assertHuman("tok", null, REGISTER_ACTION, { secret: SECRET, fetchImpl })).rejects.toBeInstanceOf(HumanCheckFailedError);
  });

  it("reports a rejected secret as unavailable, not as the visitor failing", async () => {
    const fetchImpl = siteverify({ success: false, "error-codes": ["invalid-input-secret"] });
    await expect(assertHuman("tok", null, REGISTER_ACTION, { secret: SECRET, fetchImpl })).rejects.toBeInstanceOf(HumanCheckUnavailableError);
  });

  it("refuses rather than waves through when Cloudflare cannot be reached", async () => {
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(assertHuman("tok", null, REGISTER_ACTION, { secret: SECRET, fetchImpl: down })).rejects.toBeInstanceOf(HumanCheckUnavailableError);
    await expect(assertHuman("tok", null, REGISTER_ACTION, { secret: SECRET, fetchImpl: siteverify({}, 502) })).rejects.toBeInstanceOf(HumanCheckUnavailableError);
  });
});
