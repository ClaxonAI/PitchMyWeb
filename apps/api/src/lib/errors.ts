// Shared domain error taxonomy (backend_tasks.md section 39). Route handlers
// built in a later phase can map these to HTTP status codes without each
// service reinventing its own error shape.

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
    // Extra machine-readable fields merged into the {error:{...}} envelope
    // alongside code/message — e.g. InsufficientPitchCreditsError's
    // {available, requested}, so the client can render "only 12 left" without
    // parsing it back out of the message string. Optional: most errors carry
    // none, and this is never a substitute for a readable `message`.
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404);
  }
}

// Phase 4 API layer: no valid session cookie / not logged in.
export class UnauthenticatedError extends DomainError {
  constructor() {
    super("Authentication required", "UNAUTHENTICATED", 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have permission to do that") {
    super(message, "FORBIDDEN", 403);
  }
}

export class AccountSuspendedError extends DomainError {
  constructor() {
    super("This account has been suspended", "ACCOUNT_SUSPENDED", 403);
  }
}

// Phase 4 API layer: malformed request body/query/params that failed Zod
// validation. Route handlers translate a caught ZodError into this shape so
// every 400 response carries the same {code, message} envelope.
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

// Phase 4 code-review finding #12: section 41 calls for "rate limiting for
// public/AI-triggering endpoints where practical" — login/register had
// none. 429, per section 39's suggested status categories.
export class RateLimitedError extends DomainError {
  constructor(message = "Too many attempts. Please try again later.") {
    super(message, "RATE_LIMITED", 429);
  }
}

export class RateLimitUnavailableError extends DomainError {
  constructor() {
    super("Temporary protection unavailable. Please try again later.", "RATE_LIMIT_UNAVAILABLE", 503);
  }
}

export class InvalidLeadTransitionError extends ConflictError {
  constructor(
    public readonly currentStatus: string,
    public readonly attemptedStatus: string,
  ) {
    super(`Cannot transition lead from ${currentStatus} to ${attemptedStatus}`);
    this.name = "InvalidLeadTransitionError";
  }
}

export class InvalidCampaignTransitionError extends ConflictError {
  constructor(
    public readonly currentStatus: string,
    public readonly attemptedStatus: string,
  ) {
    super(`Cannot transition campaign from ${currentStatus} to ${attemptedStatus}`);
    this.name = "InvalidCampaignTransitionError";
  }
}

// Phase 6 (section 12/18): "invalid publish state" — e.g. publishing an
// already-published project.
export class InvalidWebsiteTransitionError extends ConflictError {
  constructor(
    public readonly currentStatus: string,
    public readonly attemptedStatus: string,
  ) {
    super(`Cannot transition website project from ${currentStatus} to ${attemptedStatus}`);
    this.name = "InvalidWebsiteTransitionError";
  }
}

// Phase 5 AI analysis (section 6): OLLAMA_BASE_URL/OLLAMA_MODEL missing —
// a server misconfiguration, not a transient upstream failure, but still
// must not crash the process; the route catches this the same way as any
// other DomainError.
export class AiConfigurationError extends DomainError {
  constructor(message: string) {
    super(message, "AI_NOT_CONFIGURED", 503);
  }
}

// Phase 5 AI analysis (section 13/39): Ollama itself is an external
// dependency — timeout, connection failure, or output that is still
// invalid after the one permitted repair attempt all land here. 502
// ("external dependency failure") per section 39's suggested categories.
// The message is always a fixed, sanitized string (section 19: never
// expose raw Ollama errors to clients) — see lib/ai/lead-analysis.service.ts.
export class AiAnalysisFailedError extends DomainError {
  constructor(message = "AI analysis failed. You can retry later.") {
    super(message, "AI_ANALYSIS_FAILED", 502);
  }
}

// Phase 7 pitch generation: same shape/reasoning as AiAnalysisFailedError,
// kept as its own class (distinct code) so API consumers can tell "analysis
// failed" from "pitch generation failed" apart rather than reusing one
// generic AI-failure code for two different operations.
export class AiPitchFailedError extends DomainError {
  constructor(message = "Pitch generation failed. You can retry later.") {
    super(message, "AI_PITCH_FAILED", 502);
  }
}

// Prisma's unique-constraint violation code. Used to recover from a race
// between an idempotent find-or-create check and a concurrent insert
// (backend_tasks.md section 37: retries must not create duplicates, and
// dedup must not rely on in-memory state alone).
export function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

// Lead discovery: the configured async lead provider (apps/discovery-worker)
// could not be reached, timed out, or rejected the trigger. 502, the same
// "external dependency failure" category as the AI errors above.
export class LeadProviderError extends DomainError {
  constructor(message = "Lead discovery could not be started. You can retry later.") {
    super(message, "LEAD_PROVIDER_FAILED", 502);
  }
}

// Production kill switch (LEAD_DISCOVERY_PAUSED=true): new campaign runs are
// refused while an operator investigates the lead source. In-flight runs
// still receive their callbacks and finish normally.
export class LeadDiscoveryPausedError extends DomainError {
  constructor() {
    super("Lead discovery is temporarily paused. Please try again later.", "LEAD_DISCOVERY_PAUSED", 503);
  }
}

// Per-user daily cap on campaign runs (MAX_CAMPAIGN_RUNS_PER_USER_PER_DAY),
// which bounds scraping spend. A subclass of RateLimitedError so clients
// that already handle 429 need no change.
export class DailyRunLimitError extends RateLimitedError {
  constructor(limit: number) {
    super(`Daily limit of ${limit} campaign runs reached. Try again tomorrow.`);
    this.name = "DailyRunLimitError";
  }
}

// Checkout (lib/checkout/): RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing —
// a server misconfiguration, same shape/reasoning as AiConfigurationError.
export class PaymentConfigurationError extends DomainError {
  constructor(message: string) {
    super(message, "PAYMENT_NOT_CONFIGURED", 503);
  }
}

// Checkout: Razorpay's API itself failed (network error, non-2xx, malformed
// response) — an external dependency failure, same category as
// LeadProviderError/AiAnalysisFailedError (502). The message is always a
// fixed, sanitized string; the raw Razorpay error is logged server-side
// only, never returned to the client.
export class PaymentGatewayError extends DomainError {
  constructor(message = "Payment could not be started. You can retry.") {
    super(message, "PAYMENT_GATEWAY_FAILED", 502);
  }
}

// Checkout: the razorpay_signature the client returned does not match
// HMAC-SHA256(order_id + "|" + payment_id, key_secret) — either a forged
// request or Razorpay reporting a failed payment. The order is marked
// FAILED, never PAID, regardless of what the client claims.
export class PaymentVerificationError extends DomainError {
  constructor(message = "Payment verification failed") {
    super(message, "PAYMENT_VERIFICATION_FAILED", 400);
  }
}

export class PaymentRequiredError extends DomainError {
  constructor(message = "Pay for a plan before searching for leads.") {
    super(message, "PAYMENT_REQUIRED", 402);
  }
}

/**
 * A pitch request named a count greater than the wallet's `availableCredits`
 * at reservation time. 400, not 402 — the account is not unpaid (that's
 * PaymentRequiredError, zero capacity at all), it just asked for more than
 * its current balance covers.
 */
export class InsufficientPitchCreditsError extends DomainError {
  constructor(available: number, requested: number) {
    super(
      available === 0
        ? "You have no pitch credits available."
        : `Only ${available} pitch credit${available === 1 ? "" : "s"} available; you asked for ${requested}.`,
      "INSUFFICIENT_PITCH_CREDITS",
      400,
      { available, requested },
    );
  }
}
