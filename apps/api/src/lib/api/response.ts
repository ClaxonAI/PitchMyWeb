import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "../errors";

// backend_tasks.md section 39/6: every API error uses the same
// {error:{code,message}} envelope and an appropriate HTTP status. This is
// the single place that maps a thrown error to that shape, so route
// handlers never build an error response by hand.

export type ApiErrorBody = { error: { code: string; message: string } };

export function jsonError(status: number, code: string, message: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Converts a Zod flatten() error into a single readable message. Route
 * handlers never leak the raw ZodError (stack traces, internal paths) to
 * the client — only this summarized message.
 */
function describeZodError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
  return issues.join("; ") || "Invalid input";
}

/**
 * Maps any error thrown by a route handler to a normalized JSON error
 * response. Known domain/validation errors keep their specific code and
 * HTTP status (400/401/404/409/...); anything unexpected becomes a generic
 * 500 with no leaked internal detail (message, stack, DB error code), per
 * section 39: "Do not expose stack traces, database credentials, or secrets
 * to clients." The original error is still logged server-side for
 * debugging.
 */
export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    return jsonError(400, "VALIDATION_ERROR", describeZodError(error));
  }

  if (error instanceof DomainError) {
    return jsonError(error.httpStatus, error.code, error.message);
  }

  console.error("Unhandled API error:", error);
  return jsonError(500, "INTERNAL_ERROR", "Unexpected server error");
}

export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}
