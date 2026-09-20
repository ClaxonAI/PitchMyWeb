import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { UnauthenticatedError } from "../errors";

// Authenticates scheduler calls to /api/internal/jobs/* with a static
// bearer token (INTERNAL_JOBS_SECRET). Fails closed: if the secret is not
// configured, every call is rejected.

const MIN_SECRET_LENGTH = 24;

function digest(value: string): Buffer {
  // Hash both sides so the comparison is constant-time regardless of length.
  return createHash("sha256").update(value).digest();
}

export function requireJobSecret(request: NextRequest, secret = process.env.INTERNAL_JOBS_SECRET): void {
  const expected = secret?.trim();
  if (!expected || expected.length < MIN_SECRET_LENGTH) throw new UnauthenticatedError();

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new UnauthenticatedError();

  if (!timingSafeEqual(digest(match[1]!.trim()), digest(expected))) throw new UnauthenticatedError();
}
