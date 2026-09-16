import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { ValidationError } from "../errors";

// Shared parsing helpers so every route handler validates external input the
// same way (Rule 5: "Validate all external input... Use Zod") instead of
// hand-rolling `await request.json()` + `schema.parse` in each route file.

/**
 * Parses and validates a JSON request body. A malformed (non-JSON) body is
 * treated as a validation failure (400), not an unexpected server error —
 * `request.json()` throwing a SyntaxError would otherwise surface as a raw,
 * unmapped exception.
 */
export async function parseJsonBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return schema.parse(raw);
}

/** Parses and validates URL query parameters. */
export function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  return schema.parse(params);
}

/**
 * Like parseJsonBody, but a missing/empty body is treated as `{}` rather
 * than a validation error — for endpoints whose entire body is optional
 * (e.g. POST /api/campaigns/:id/run's optional idempotencyKey).
 */
export async function parseOptionalJsonBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const raw = await request.text();
  if (raw.trim().length === 0) {
    return schema.parse({});
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return schema.parse(parsed);
}
