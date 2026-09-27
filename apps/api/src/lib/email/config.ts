// Transactional email configuration (Resend). Server-side only: nothing here
// may ever reach a browser bundle, so there is deliberately no NEXT_PUBLIC_
// variant of any of these.
//
//   RESEND_API_KEY         a sending-access key for the verified domain; in
//                          production it lives only in SSM (SecureString)
//   RESEND_FROM_EMAIL      e.g. "PitchMyWeb <no-reply@pitchmyweb.in>"
//   RESEND_REPLY_TO_EMAIL  optional; where a customer's reply goes
//
// Either of the first two unset means email is off: sends are skipped and
// reported, never attempted with a guessed sender.

export type EmailConfig = { apiKey: string; from: string; replyTo: string | null };

export type EmailConfigResult =
  | { ok: true; config: EmailConfig }
  | { ok: false; reason: "not_configured" | "invalid_from" | "invalid_reply_to" | "test_sender_in_production" };

// "Name <local@domain>" or a bare "local@domain".
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const NAMED_ADDRESS = /^[^<>]*<([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>$/;

/** The bare address in a sender string, or null if it is not a valid one. */
export function senderAddress(value: string): string | null {
  const trimmed = value.trim();
  if (ADDRESS.test(trimmed)) return trimmed;
  return NAMED_ADDRESS.exec(trimmed)?.[1] ?? null;
}

export function readEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfigResult {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { ok: false, reason: "not_configured" };

  const fromAddress = senderAddress(from);
  if (!fromAddress) return { ok: false, reason: "invalid_from" };
  // resend.dev is Resend's shared onboarding sender: it only delivers to the
  // account owner, so in production it would quietly reach no customer.
  if (env.APP_ENV?.trim().toLowerCase() === "production" && fromAddress.toLowerCase().endsWith("@resend.dev")) {
    return { ok: false, reason: "test_sender_in_production" };
  }

  const replyTo = env.RESEND_REPLY_TO_EMAIL?.trim() || null;
  if (replyTo && !ADDRESS.test(replyTo)) return { ok: false, reason: "invalid_reply_to" };

  return { ok: true, config: { apiKey, from, replyTo } };
}
