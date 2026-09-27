import { isIP } from "node:net";
import { HumanCheckFailedError, HumanCheckUnavailableError } from "../errors";

// Cloudflare Turnstile on the password sign-up form. Google and GitHub sign-up
// go through Clerk, which runs its own Turnstile check; the password form was
// the one way to make accounts with nothing asking whether a person was there,
// held back only by the per-address rate limit and the device fingerprint,
// both of which a script can rotate.
//
//   TURNSTILE_SECRET_KEY  the widget's secret. Unset: no check, which is what
//                         local development and the test suite run with.
//
// The browser half is apps/web's NEXT_PUBLIC_TURNSTILE_SITE_KEY. Set both or
// neither: a secret without the site key refuses every password sign-up,
// because the form never gets a token to send.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The action the sign-up widget is rendered with, so a token solved on another form is refused. */
export const REGISTER_ACTION = "register";

type SiteverifyResult = { success?: boolean; action?: string; "error-codes"?: string[] };

export type TurnstileOptions = {
  secret?: string | null;
  fetchImpl?: typeof fetch;
};

export function turnstileSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.TURNSTILE_SECRET_KEY?.trim() || null;
}

/**
 * Throws unless the Turnstile token was solved for this action, or Turnstile
 * is not configured. Cloudflare being unreachable refuses the sign-up (503)
 * rather than waving it through: the check is only worth having if it cannot
 * be skipped by making it time out.
 */
export async function assertHuman(
  token: string | undefined,
  remoteIp: string | null,
  action: string,
  { secret = turnstileSecret(), fetchImpl = fetch }: TurnstileOptions = {},
): Promise<void> {
  if (!secret) return;
  if (!token) throw new HumanCheckFailedError();

  const body: Record<string, string> = { secret, response: token };
  // clientIp() falls back to a browser fingerprint when there is no proxy
  // header; only a real address is worth sending.
  if (remoteIp && isIP(remoteIp)) body.remoteip = remoteIp;

  let result: SiteverifyResult;
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`siteverify answered ${response.status}`);
    result = (await response.json()) as SiteverifyResult;
  } catch (error) {
    console.error("[turnstile] siteverify failed:", error instanceof Error ? error.message : error);
    throw new HumanCheckUnavailableError();
  }

  if (result.success !== true) {
    const codes = result["error-codes"] ?? [];
    // A bad secret is our misconfiguration, not the visitor failing the check.
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
      console.error("[turnstile] TURNSTILE_SECRET_KEY was rejected by Cloudflare");
      throw new HumanCheckUnavailableError();
    }
    throw new HumanCheckFailedError();
  }
  if (result.action !== undefined && result.action !== action) throw new HumanCheckFailedError();
}
