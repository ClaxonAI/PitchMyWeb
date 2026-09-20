import type { PrismaClient, User } from "@pitchmyweb/db";
import { AccountSuspendedError, UnauthenticatedError } from "../errors";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

// Deliberately typed against the minimal shape we need (a `.cookies.get`
// reader) rather than importing `NextRequest` directly. `next/headers`'s
// `cookies()` helper only works inside Next's own request-scoped runtime
// (AsyncLocalStorage), which makes route handlers that use it impossible to
// unit-test by calling the handler function directly. Reading the cookie off
// the request object itself (which `NextRequest` already exposes via
// `request.cookies`) works identically in production and in a plain vitest
// call with a hand-built `NextRequest`.
export type CookieReader = {
  cookies: { get(name: string): { value: string } | undefined };
};

export async function getCurrentUser(db: PrismaClient, request: CookieReader): Promise<User | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(db, token);
}

export async function requireCurrentUser(db: PrismaClient, request: CookieReader): Promise<User> {
  const user = await getCurrentUser(db, request);
  if (!user) throw new UnauthenticatedError();
  if (user.suspendedAt) throw new AccountSuspendedError();
  return user;
}
