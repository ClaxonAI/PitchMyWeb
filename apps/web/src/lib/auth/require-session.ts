import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type SessionUser = { id: string; email: string; name: string | null; role: "USER" | "ADMIN" | "SUPER_ADMIN"; planId: string | null; hasPaidAccess: boolean; allowedMarkets: Array<"india" | "foreign">; canDiscover: boolean; freePitchesRemaining: number | null; freePitchesAllowance: number };

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Resolves the current session by asking the API (GET /api/me), the same
 * authority that guards every endpoint — not by inspecting the cookie
 * ourselves, since a cookie can be present but expired or revoked.
 *
 * Deliberately fails *closed*: any doubt (401, network error, non-2xx)
 * returns null rather than rendering with a degraded/empty state. This is a
 * different tradeoff than the original single WhatsApp page's own guard
 * (which rendered with empty data on a non-401 failure, so one feature
 * panel degraded gracefully instead of bouncing a signed-in user) — that
 * leniency made sense for one page's own data fetch. Here, this is the
 * *only* check every dashboard page depends on; treating "API unreachable"
 * as "logged in" would render the whole shell with a null session and push
 * the same null-check onto every child page. Do not "fix" this to match
 * the old page's leniency without re-deriving why they differ.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/me`, {
      headers: cookie ? { Cookie: cookie } : {},
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as SessionUser;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
