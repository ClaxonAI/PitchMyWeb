// The outreach policy vocabulary, shared so the API pre-check and the
// worker gate cannot drift apart.
//
// The gate runs twice on purpose. The API checks before it creates a QUEUED
// row, so the user gets an immediate, inline explanation instead of a
// message that silently dies later. The worker checks again immediately
// before sending, because time passes between those two moments: a business
// can reply STOP, the account can drop, or the hourly cap can fill while the
// job waits in the queue. The worker check is the authoritative one; the API
// check is there for the user experience.

export const POLICY_REASONS = [
  /** The number is on the global do-not-contact list. */
  "opted_out",
  /** The account is not CONNECTED right now. */
  "not_connected",
  /** The number is not a plausible phone number, or is not on WhatsApp. */
  "invalid_number",
  /** This account already messaged this number inside the cooling-off window. */
  "recent_duplicate",
  /** An hourly/daily cap, or the minimum gap between sends. */
  "rate_limited",
  /**
   * Another PitchMyWeb user contacted this number inside the exclusivity
   * window (business exclusivity: one user per business for 90 days).
   */
  "claimed_elsewhere",
] as const;

/** Business exclusivity window, in days. Matches EXCLUSIVE_DAYS in apps/api's claims.service. */
export const EXCLUSIVITY_WINDOW_DAYS = 90;

export type PolicyReason = (typeof POLICY_REASONS)[number];

export type PolicyDecision = { allowed: true } | { allowed: false; reason: PolicyReason; message: string };

/** User-facing explanations. Safe to show in the UI verbatim. */
export const POLICY_REASON_MESSAGES: Record<PolicyReason, string> = {
  opted_out: "This number has opted out of messages and cannot be contacted.",
  not_connected: "Connect a WhatsApp account before sending.",
  invalid_number: "This number is not reachable on WhatsApp.",
  recent_duplicate: "You already messaged this number recently. Give it some time before following up.",
  rate_limited: "Sending limit reached for now. This message will go out shortly.",
  claimed_elsewhere: "Another PitchMyWeb user is already working with this business, so it was skipped.",
};

export function deny(reason: PolicyReason): PolicyDecision {
  return { allowed: false, reason, message: POLICY_REASON_MESSAGES[reason] };
}

export const ALLOWED: PolicyDecision = { allowed: true };
