// Shared domain error taxonomy (backend_tasks.md section 39). Route handlers
// built in a later phase can map these to HTTP status codes without each
// service reinventing its own error shape.

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
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
