import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type SessionUser = { id: string; email: string; name: string | null; role: "USER" | "ADMIN" | "SUPER_ADMIN"; planId: string | null; hasPaidAccess: boolean; allowedMarkets: Array<"india" | "foreign">; canDiscover: boolean; availableCredits: number; reservedCredits: number; usedCredits: number };

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Mirrors apps/api's SESSION_COOKIE_NAME. Duplicated rather than imported
// because the two apps do not share a module graph, and it is only used to
// name the cookie in a diagnostic — nothing here depends on its value.
const SESSION_COOKIE_NAME = "pmw_session";

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
  const jar = await cookies();
  const cookie = jar.toString();
  try {
    const response = await fetch(`${API_URL}/api/me`, {
      headers: cookie ? { Cookie: cookie } : {},
      cache: "no-store",
    });
    if (!response.ok) {
      // Says which half failed, because the two look identical from the
      // browser — both land on /login with nothing else to go on. Either the
      // session cookie never arrived (the exchange did not run, or its
      // Set-Cookie was dropped) or it arrived and the API declined it
      // (expired, revoked, or pointing at a row that no longer exists).
      // Names only; no cookie values.
      console.warn(
        `[auth] /api/me refused with ${response.status}. Session cookie was ${
          jar.has(SESSION_COOKIE_NAME) ? "present" : "ABSENT"
        }; cookies on the request: ${jar.getAll().map((c) => c.name).join(", ") || "none"}`,
      );
      return null;
    }
    return (await response.json()) as SessionUser;
  } catch (error) {
    console.warn(`[auth] /api/me unreachable at ${API_URL}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  // /login recovers a visitor who is signed in with Clerk but holds no app
  // session — the state an SSO round trip leaves them in when Clerk returns
  // them straight here. It performs the exchange on arrival and sends them
  // back, so this stays a plain redirect.
  if (!session) redirect("/login");
  return session;
}
